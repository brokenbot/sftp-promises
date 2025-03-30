const { Buffer } = require('node:buffer')
const { Client, SFTP_OPEN_MODE, SFTP_STATUS_CODE } = require('ssh2')

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
   */
  getBuffer(location, session) {
    const getBufferCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.open(location, 'r', (err, handle) => {
          if (err) { return reject(err) }
          sftp.fstat(handle, (err, stat) => {
            if (err) { return reject(err) }
            let bytes = stat.size
            const buffer = Buffer.alloc(bytes)
            if (bytes === 0) {
              return resolve(buffer)
            }
            buffer.fill(0)
            const cb = (err, readBytes, offsetBuffer, position) => {
              if (err) { return reject(err) }
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
   * @returns {Promise<boolean>} Promise with boolean true if transfer was successful
   */
  putBuffer(buffer, location, session) {
    const putBufferCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.open(location, 'w', (err, handle) => {
          if (err) { return reject(err) }
          sftp.write(handle, buffer, 0, buffer.length, 0, (err) => {
            if (err) { return reject(err) }
            sftp.close(handle, (err) => {
              if (err) { return reject(err) }
              resolve(true)
            })
          })
        })
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
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  get(remote, local, session) {
    const getCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.fastGet(remote, local, (err) => {
          if (err) { return reject(err) }
          resolve(true)
        })
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
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  put(local, remote, session) {
    const putCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (err) { return reject(err) }
        sftp.fastPut(local, remote, (err) => {
          if (err) { return reject(err) }
          resolve(true)
        })
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
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  getStream(path, writableStream, session) {
    const getStreamCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (!writableStream.writable) {
          return reject(new Error('Stream must be a writable stream'))
        }
        if (err) { return reject(err) }
        sftp.stat(path, (err, stat) => {
          if (err) { return reject(err) }
          let bytes = stat.size
          if (bytes > 0) {
            bytes -= 1
          }
          try {
            const stream = sftp.createReadStream(path, {start: 0, end: bytes})
            stream.pipe(writableStream)
            stream.on('end', () => {
              resolve(true)
            })
            stream.on('error', (err) => {
              reject(err)
            })
          } catch (err) {
            return reject(err)
          }
        })
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
   * @returns {Promise<boolean>} Promise with boolean true if successful
   */
  putStream(path, readableStream, session) {
    const putStreamCmd = (resolve, reject) => {
      return (err, sftp) => {
        if (!readableStream.readable) {
          return reject(new Error('Stream must be a readable stream'))
        }
        if (err) { return reject(err) }
        try {
          const stream = sftp.createWriteStream(path)
          stream.on('ready', () => {
            readableStream.pipe(stream)
          })
          readableStream.on('error', (err) => {
            reject(err)
          })
          stream.on('close', () => {
            resolve(true)
          })
          stream.on('error', (err) => {
            reject(err)
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
