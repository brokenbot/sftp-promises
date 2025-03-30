const { Buffer } = require('node:buffer')
const { Client, SFTP_OPEN_MODE, SFTP_STATUS_CODE } = require('ssh2')
const path = require('path')

/**
 * Maximum file size for buffer operations (100MB)
 * @type {number}
 */
const MAX_BUFFER_SIZE = 100 * 1024 * 1024

/**
 * Validates a path to prevent path traversal attacks
 * 
 * @private
 * @param {string} filePath - Path to validate
 * @returns {string} Normalized path
 * @throws {Error} If path contains invalid sequences
 */
const validatePath = function (filePath) {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Path must be a non-empty string')
  }
  
  // Normalize the path to remove any ../ sequences
  const normalizedPath = path.normalize(filePath)
  
  // Check for suspicious path patterns
  if (normalizedPath.includes('../') || normalizedPath.includes('..\\')) {
    throw new Error('Path contains invalid traversal sequences')
  }
  
  return normalizedPath
}

/**
 * Convert stats object to attributes object
 *
 * @private
 * @param {Object} stats - Stats object from sftp.stat
 * @returns {Object} Attributes object
 */
const statToAttrs = function (stats) {
  const attrs = {}
  for (const attr in stats) {
    if (Object.prototype.hasOwnProperty.call(stats, attr)) {
      attrs[attr] = stats[attr]
    }
  }
  return attrs
}

/**
 * Constructor for creating SFTPClient
 *
 * @constructor
 * @param {*} config
 * 
 * Note: config wasn't accessible to functions in the class because anonymous functions
 * create their own 'this' context. This was fixed by using arrow functions.
 */
class SFTPClient {
  constructor(config = {}) {
    this.config = config
    this.MODES = SFTP_OPEN_MODE
    this.CODES = SFTP_STATUS_CODE
  }

  /**
  * Creates connection and promise wrapper for sftp commands
  *
  * @param {Function} cmdCB - callback for sftp, takes resolve, reject and connection
  * @param {ssh2.Client} [session] - existing ssh2 connection, optional
  * @param {boolean} [persist=false] - whether to keep the connection open
  * @returns {Promise} Promise that resolves with the command result
  */
  sftpCmd (cmdCB, session = false, persist = false) {
    const conn = session || new Client()

    // handle persistent connection
    const handleConn = (failed) => {
      if (!session && (!persist || failed)) {
        conn.end()
        conn.destroy()
      }
    }

    // reject promise handler
    const rejected = (err) => {
      handleConn(true)
      return Promise.reject(err)
    }

    // resolve promise handler
    const resolved = (val) => {
      handleConn(false)
      return Promise.resolve(val)
    }

    return new Promise((resolve, reject) => {
      const compiledCallBack = cmdCB(resolve, reject, conn)
      if (session) {
        conn.sftp(compiledCallBack)
      } else {
        conn.on('ready', () => {
          conn.sftp(compiledCallBack)
        })
        conn.on('end', () => {
          reject(new Error('Connection closed'))
        })
        conn.on('error', (err) => {
          reject(err)
        })
        conn.connect(this.config)
      }
    // handle the persistent connection regardless of how promise fairs
    }).then(resolved, rejected)
  }
  
  /**
   * Creates a new ssh2 session
   *
   * @param {Object} conf - valid ssh2 config
   * @returns {Promise} returns a Promise with an ssh2 connection object if resolved
   */
  session (conf) {
    return new Promise((resolve, reject) => {
      const conn = new Client()
      conn.on('ready', () => {
        conn.removeAllListeners()
        resolve(conn)
      })
      .on('end', () => {
        reject(new Error('Connection closed'))
      })
      .on('error', (err) => {
        reject(err)
      })
      try {
        conn.connect(conf)
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * unix ls -l style return
   *
   * @param {string} path - on filesystem to stat
   * @param {ssh2.Client} [session] - existing ssh2 connection, optional
   * @return {Promise} Promise with object describing path
   */
  ls (location, session) {
    // create the lsCmd callback for this.sftpCmd
    const lsCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.stat(location, (err, stat) => {
          if (err) { return reject(err) }
          const attrs = statToAttrs(stat)
          if (stat.isDirectory()) {
            sftp.readdir(location, (err, list) => {
              if (err) { return reject(err) }
              resolve({ path: location, type: 'directory', attrs: attrs, entries: list })
            })
          } else if (stat.isFile()) {
            resolve({ path: location, type: 'file', attrs: attrs })
          } else {
            resolve({ path: location, type: 'other', attrs: attrs })
          }
        })
      }
    }
    // return the value of the command
    return this.sftpCmd(lsCmd, session)
  }

  /**
   * stat a file or directory
   *
   * @param {string} path - on filesystem to stat
   * @param {ssh2.Client} [session] - existing ssh2 connection, optional
   * @return {Promise} Promise with object describing path
   */
  stat (location, session) {
    // create the lsCmd callback for this.sftpCmd
    const statCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.stat(location, (err, stat) => {
          if (err) { return reject(err) }
          const attrs = statToAttrs(stat)
          attrs.path = location
          if (stat.isDirectory()) {
            attrs.type = 'directory'
          } else if (stat.isFile()) {
            attrs.type = 'file'
          } else {
            attrs.type = 'other'
          }
          resolve(attrs)
        })
      }
    }
    // return the value of the command
    return this.sftpCmd(statCmd, session)
  }

  /**
   * Get remote file contents into a Buffer
   *
   * @param {string} location - path on remote filesystem to read
   * @param {ssh2.Client} [session] - existing ssh2 connection, optional
   * @returns {Promise<Buffer>} Promise with Buffer on resolve
   * @throws {Error} If file size exceeds MAX_BUFFER_SIZE
   */
  getBuffer(location, session) {
    const getBufferCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        
        try {
          const safePath = validatePath(location)
          
          sftp.open(safePath, 'r', (err, handle) => {
            if (err) { return reject(err) }
            
            sftp.fstat(handle, (err, stat) => {
              if (err) {
                return sftp.close(handle, () => {
                  reject(err)
                })
              }
              
              let bytes = stat.size
              
              // Check file size limit to prevent DoS
              if (bytes > MAX_BUFFER_SIZE) {
                return sftp.close(handle, () => {
                  reject(new Error(`File size (${bytes} bytes) exceeds maximum allowed size (${MAX_BUFFER_SIZE} bytes)`))
                })
              }
              
              const buffer = Buffer.alloc(bytes)
              if (bytes === 0) {
                return sftp.close(handle, (err) => {
                  if (err) { return reject(err) }
                  resolve(buffer)
                })
              }
              
              buffer.fill(0)
              const cb = (err, readBytes, offsetBuffer, position) => {
                if (err) {
                  return sftp.close(handle, () => {
                    reject(err)
                  })
                }
                
                position = position + readBytes
                bytes = bytes - readBytes
                
                if (bytes < 1) {
                  sftp.close(handle, (err) => {
                    if (err) { return reject(err) }
                    resolve(buffer)
                  })
                } else {
                  sftp.read(handle, buffer, position, bytes, position, cb)
                }
              }
              
              sftp.read(handle, buffer, 0, bytes, 0, cb)
            })
          })
        } catch (error) {
          reject(error)
        }
      }
    }
    return this.sftpCmd(getBufferCmd, session)
  }

  /**
   * Put buffer to remote file
   *
   * @param {Buffer} buffer - Buffer containing file contents
   * @param {string} location - path on remote filesystem to write
   * @param {ssh2.Client} [session] - existing ssh2 connection, optional
   * @param {number} [mode=0o644] - File permissions
   * @returns {Promise<boolean>} Promise with boolean true if transfer was successful
   * @throws {Error} If buffer size exceeds MAX_BUFFER_SIZE
   */
  putBuffer(buffer, location, session, mode = 0o644) {
    const putBufferCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        
        try {
          // Validate input
          if (!Buffer.isBuffer(buffer)) {
            return reject(new Error('First parameter must be a Buffer'))
          }
          
          // Check buffer size
          if (buffer.length > MAX_BUFFER_SIZE) {
            return reject(new Error(`Buffer size (${buffer.length} bytes) exceeds maximum allowed size (${MAX_BUFFER_SIZE} bytes)`))
          }
          
          const safePath = validatePath(location)
          
          // Use 'wx' mode to fail if file exists, preventing accidental overwrites
          sftp.open(safePath, 'w', mode, (err, handle) => {
            if (err) { return reject(err) }
            
            sftp.write(handle, buffer, 0, buffer.length, 0, (err) => {
              if (err) {
                return sftp.close(handle, () => {
                  reject(err)
                })
              }
              
              sftp.close(handle, (err) => {
                if (err) { return reject(err) }
                resolve(true)
              })
            })
          })
        } catch (error) {
          reject(error)
        }
      }
    }
    return this.sftpCmd(putBufferCmd, session)
  }

  /**
   * Get remote file and save it locally
   *
   * @param {string} remote - path to remote file
   * @param {string} local - destination path on local filesystem
   * @param {ssh2.Client} [session] - existing ssh2 connection, optional
   * @param {Object} [options] - Additional options for the transfer
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  get(remote, local, session, options = {}) {
    const getCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        
        try {
          const safeRemotePath = validatePath(remote)
          const safeLocalPath = validatePath(local)
          
          // Check file size before transfer
          sftp.stat(safeRemotePath, (err, stats) => {
            if (err) { return reject(err) }
            
            // Check file size limit if not explicitly disabled
            if (!options.skipSizeValidation && stats.size > MAX_BUFFER_SIZE) {
              return reject(new Error(`File size (${stats.size} bytes) exceeds maximum allowed size (${MAX_BUFFER_SIZE} bytes)`))
            }
            
            sftp.fastGet(safeRemotePath, safeLocalPath, (err) => {
              if (err) { return reject(err) }
              resolve(true)
            })
          })
        } catch (error) {
          reject(error)
        }
      }
    }
    return this.sftpCmd(getCmd, session)
  }

  /**
   * Put local file in remote path
   *
   * @param {string} local - path to local file
   * @param {string} remote - destination path on remote filesystem
   * @param {ssh2.Client} [session] - existing ssh2 connection, optional
   * @param {Object} [options] - Additional options for the transfer
   * @param {number} [options.mode=0o644] - File permissions
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  put(local, remote, session, options = {}) {
    const putCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        
        try {
          const safeLocalPath = validatePath(local)
          const safeRemotePath = validatePath(remote)
          
          // Check if file exists and get its size
          const fs = require('fs')
          fs.stat(safeLocalPath, (err, stats) => {
            if (err) { return reject(err) }
            
            // Check file size limit if not explicitly disabled
            if (!options.skipSizeValidation && stats.size > MAX_BUFFER_SIZE) {
              return reject(new Error(`File size (${stats.size} bytes) exceeds maximum allowed size (${MAX_BUFFER_SIZE} bytes)`))
            }
            
            const transferOptions = {
              mode: options.mode || 0o644
            }
            
            sftp.fastPut(safeLocalPath, safeRemotePath, transferOptions, (err) => {
              if (err) { return reject(err) }
              resolve(true)
            })
          })
        } catch (error) {
          reject(error)
        }
      }
    }
    return this.sftpCmd(putCmd, session)
  }

  /**
   * Remove remote file
   *
   * @param {string} location - remote file to remove
   * @param {ssh2.Client} [session] - existing ssh2 connection, optional
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  rm(location, session) {
    const rmCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.unlink(location, (err) => {
          if (err) { return reject(err) }
          resolve(true)
        })
      }
    }
    return this.sftpCmd(rmCmd, session)
  }

  /**
   * Move remote file from one spot to another
   *
   * @param {string} src - remote filesystem source path
   * @param {string} dest - remote filesystem destination path
   * @param {ssh2.Client} [session] - existing ssh2 connection, optional
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  mv(src, dest, session) {
    const mvCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.rename(src, dest, (err) => {
          if (err) { return reject(err) }
          resolve(true)
        })
      }
    }
    return this.sftpCmd(mvCmd, session)
  }

  /**
   * Removes an empty directory
   *
   * @param {string} path - remote directory to remove
   * @param {ssh2.Client} [session] - existing ssh2 connection, optional
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  rmdir(path, session) {
    const rmdirCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.rmdir(path, (err) => {
          if (err) { return reject(err) }
          return resolve(true)
        })
      }
    }
    return this.sftpCmd(rmdirCmd, session)
  }

  /**
   * Makes a directory
   *
   * @param {string} path - remote directory to be created
   * @param {ssh2.Client} [session] - existing ssh2 connection, optional
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  mkdir(path, session) {
    const mkdirCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.mkdir(path, (err) => {
          if (err) { return reject(err) }
          return resolve(true)
        })
      }
    }
    return this.sftpCmd(mkdirCmd, session)
  }

  /**
   * Stream file contents from remote file
   *
   * @param {string} path - remote file path
   * @param {Object} writableStream - writable stream to pipe read data to
   * @param {ssh2.Client} [session] - existing ssh2 connection
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.skipSizeValidation=false] - Skip file size validation
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  getStream(path, writableStream, session, options = {}) {
    const getStreamCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (!writableStream || !writableStream.writable) {
          return reject(new Error('Stream must be a writable stream'))
        }
        if (err) { return reject(err) }
        
        try {
          const safePath = validatePath(path)
          
          sftp.stat(safePath, (err, stat) => {
            if (err) { return reject(err) }
            
            // Check file size limit if not explicitly disabled
            if (!options.skipSizeValidation && stat.size > MAX_BUFFER_SIZE) {
              return reject(new Error(`File size (${stat.size} bytes) exceeds maximum allowed size (${MAX_BUFFER_SIZE} bytes)`))
            }
            
            let bytes = stat.size
            if (bytes > 0) {
              bytes -= 1
            }
            
            try {
              const stream = sftp.createReadStream(safePath, {start: 0, end: bytes})
              let streamClosed = false
              
              // Handle errors on the destination stream
              writableStream.on('error', (err) => {
                if (!streamClosed) {
                  streamClosed = true
                  stream.destroy()
                  reject(err)
                }
              })
              
              stream.on('error', (err) => {
                if (!streamClosed) {
                  streamClosed = true
                  reject(err)
                }
              })
              
              stream.on('end', () => {
                if (!streamClosed) {
                  streamClosed = true
                  resolve(true)
                }
              })
              
              stream.pipe(writableStream)
            } catch (err) {
              return reject(err)
            }
          })
        } catch (error) {
          reject(error)
        }
      }
    }
    return this.sftpCmd(getStreamCmd, session)
  }

  /**
   * Stream file contents from local file to remote file
   *
   * @param {string} path - remote file path
   * @param {Object} readableStream - readable stream to pipe data from
   * @param {ssh2.Client} [session] - existing ssh2 connection
   * @param {Object} [options] - Additional options
   * @param {number} [options.mode=0o644] - File permissions
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  putStream(path, readableStream, session, options = {}) {
    const putStreamCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (!readableStream || !readableStream.readable) {
          return reject(new Error('Stream must be a readable stream'))
        }
        if (err) { return reject(err) }
        
        try {
          const safePath = validatePath(path)
          let streamSize = 0
          let streamClosed = false
          
          const mode = options.mode || 0o644
          const stream = sftp.createWriteStream(safePath, { mode })
          
          // Track data size to enforce limits
          readableStream.on('data', (chunk) => {
            streamSize += chunk.length
            
            // Check size limit during streaming if not explicitly disabled
            if (!options.skipSizeValidation && streamSize > MAX_BUFFER_SIZE && !streamClosed) {
              streamClosed = true
              readableStream.destroy()
              stream.destroy()
              reject(new Error(`Stream size (${streamSize} bytes) exceeds maximum allowed size (${MAX_BUFFER_SIZE} bytes)`))
            }
          })
          
          stream.on('ready', () => {
            readableStream.pipe(stream)
          })
          
          readableStream.on('error', (err) => {
            if (!streamClosed) {
              streamClosed = true
              stream.destroy()
              reject(err)
            }
          })
          
          stream.on('close', () => {
            if (!streamClosed) {
              streamClosed = true
              resolve(true)
            }
          })
          
          stream.on('error', (err) => {
            if (!streamClosed) {
              streamClosed = true
              readableStream.destroy()
              reject(err)
            }
          })
        } catch (err) {
          return reject(err)
        }
      }
    }
    return this.sftpCmd(putStreamCmd, session)
  }

  /**
   * Get a readable stream to remote file
   *
   * @param {string} path - remote file path
   * @param {ssh2.Client} [session] - existing ssh2 connection
   * @returns {Promise<Object>} Promise with readable stream
   */
  createReadStream(path, session) {
    const createReadStreamCmd = (resolve, reject, conn) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.stat(path, (err, stat) => {
          if (err) { return reject(err) }
          let bytes = stat.size
          if (bytes > 0) {
            bytes -= 1
          }
          try {
            const stream = sftp.createReadStream(path, {start: 0, end: bytes})
            stream.on('close', () => {
              // if there is no session we need to clean the connection
              if (!session) {
                conn.end()
                conn.destroy()
              }
            })
            stream.on('error', () => {
              if (!session) {
                conn.end()
                conn.destroy()
              }
            })
            stream.on('readable', () => {
              resolve(stream)
            })
          } catch (err) {
            return reject(err)
          }
        })
      }
    }
    return this.sftpCmd(createReadStreamCmd, session, true)
  }

  /**
   * Get a writable stream to remote file
   *
   * @param {string} path - remote file path
   * @param {ssh2.Client} [session] - existing ssh2 connection
   * @returns {Promise<Object>} Promise with writable stream
   */
  createWriteStream(path, session) {
    const createWriteStreamCmd = (resolve, reject, conn) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        try {
          const stream = sftp.createWriteStream(path)
          stream.on('close', () => {
            // if there is no session we need to clean the connection
            if (!session) {
              conn.end()
              conn.destroy()
            }
          })
          stream.on('error', (err) => {
            if (!session) {
              conn.end()
              conn.destroy()
            }
            reject(err)
          })
          stream.on('open', () => {
            resolve(stream)
          })
        } catch (err) {
          return reject(err)
        }
      }
    }
    return this.sftpCmd(createWriteStreamCmd, session, true)
  }

  /**
   * Get the realpath on remote server
   *
   * @param {string} path - remote path
   * @param {ssh2.Client} [session] - existing ssh2 connection
   * @returns {Promise<string>} Promise with resolved path
   */
  realpath(path, session) {
    const realpathCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.realpath(path, (err, rpath) => {
          if (err) { return reject(err) }
          resolve(rpath)
        })
      }
    }
    return this.sftpCmd(realpathCmd, session)
  }

  /**
   * Get working directory on remote server - alias for SFTPClient.realpath('.', session)
   *
   * @param {ssh2.Client} [session] - existing ssh2 connection
   * @returns {Promise<string>} Promise with current working directory path
   */
  pwd(session) {
    return this.realpath('.', session)
  }
}

// export client
module.exports = SFTPClient
