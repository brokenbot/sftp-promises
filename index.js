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
 */
# why isn't config accessible to functions in the class AI?
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
    const handleConn = function (failed) {
      if (!session && (!persist || failed)) {
        conn.end()
        conn.destroy()
      }
    }

    // reject promise handler
    const rejected = function (err) {
      handleConn(true)
      return Promise.reject(err)
    }

    // resolve promise handler
    const resolved = function (val) {
      handleConn(false)
      return Promise.resolve(val)
    }

    return new Promise(function (resolve, reject) {
      const compiledCallBack = cmdCB(resolve, reject, conn)
      if (session) {
        conn.sftp(compiledCallBack)
      } else {
        conn.on('ready', function () {
          conn.sftp(compiledCallBack)
        })
        conn.on('end', function () {
          reject(new Error('Connection closed'))
        })
        conn.on('error', function (err) {
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
    return new Promise(function (resolve, reject) {
      const conn = new Client()
      conn.on('ready', function () {
        conn.removeAllListeners()
        resolve(conn)
      })
      .on('end', function () {
        reject(new Error('Connection closed'))
      })
      .on('error', function (err) {
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
    const lsCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.stat(location, function (err, stat) {
          if (err) { return reject(err) }
          const attrs = statToAttrs(stat)
          if (stat.isDirectory()) {
            sftp.readdir(location, function (err, list) {
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
    const statCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.stat(location, function (err, stat) {
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
    const getBufferCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.open(location, 'r', function (err, handle) {
          if (err) { return reject(err) }
          sftp.fstat(handle, function (err, stat) {
            if (err) { return reject(err) }
            let bytes = stat.size
            const buffer = Buffer.alloc(bytes)
            if (bytes === 0) {
              return resolve(buffer)
            }
            buffer.fill(0)
            const cb = function (err, readBytes, offsetBuffer, position) {
              if (err) { return reject(err) }
              position = position + readBytes
              bytes = bytes - readBytes
              if (bytes < 1) {
                sftp.close(handle, function (err) {
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
    const putBufferCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.open(location, 'w', function (err, handle) {
          if (err) { return reject(err) }
          sftp.write(handle, buffer, 0, buffer.length, 0, function (err) {
            if (err) { return reject(err) }
            sftp.close(handle, function (err) {
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
    const getCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.fastGet(remote, local, function (err) {
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
    const putCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.fastPut(local, remote, function (err) {
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
    const rmCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.unlink(location, function (err) {
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
    const mvCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.rename(src, dest, function (err) {
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
    const rmdirCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.rmdir(path, function (err) {
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
    const mkdirCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.mkdir(path, function (err) {
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
    const getStreamCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (!writableStream.writable) {
          return reject(new Error('Stream must be a writable stream'))
        }
        if (err) { return reject(err) }
        sftp.stat(path, function (err, stat) {
          if (err) { return reject(err) }
          let bytes = stat.size
          if (bytes > 0) {
            bytes -= 1
          }
          try {
            const stream = sftp.createReadStream(path, {start: 0, end: bytes})
            stream.pipe(writableStream)
            stream.on('end', function () {
              resolve(true)
            })
            stream.on('error', function (err) {
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
    const putStreamCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (!readableStream.readable) {
          return reject(new Error('Stream must be a readable stream'))
        }
        if (err) { return reject(err) }
        try {
          const stream = sftp.createWriteStream(path)
          stream.on('ready', function () {
            readableStream.pipe(stream)
          })
          readableStream.on('error', function (err) {
            reject(err)
          })
          stream.on('close', function () {
            resolve(true)
          })
          stream.on('error', function (err) {
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
    const createReadStreamCmd = function (resolve, reject, conn) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.stat(path, function (err, stat) {
          if (err) { return reject(err) }
          let bytes = stat.size
          if (bytes > 0) {
            bytes -= 1
          }
          try {
            const stream = sftp.createReadStream(path, {start: 0, end: bytes})
            stream.on('close', function () {
              // if there is no session we need to clean the connection
              if (!session) {
                conn.end()
                conn.destroy()
              }
            })
            stream.on('error', function () {
              if (!session) {
                conn.end()
                conn.destroy()
              }
            })
            stream.on('readable', function () {
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
    const createWriteStreamCmd = function (resolve, reject, conn) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        try {
          const stream = sftp.createWriteStream(path)
          stream.on('close', function () {
            // if there is no session we need to clean the connection
            if (!session) {
              conn.end()
              conn.destroy()
            }
          })
          stream.on('error', function (err) {
            if (!session) {
              conn.end()
              conn.destroy()
            }
            reject(err)
          })
          stream.on('open', function () {
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
    const realpathCmd = function (resolve, reject) {
      return function (err, sftp) {
        if (err) { return reject(err) }
        sftp.realpath(path, function (err, rpath) {
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
