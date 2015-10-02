var Client = require('ssh2').Client

var statToAttrs = function (stats) {
  var attrs = {}
  for (var attr in stats) {
    if (stats.hasOwnProperty(attr)) {
      attrs[attr] = stats[attr]
    }
  }
  return attrs
}

function SFTPClient (config) {
  if (!(this instanceof SFTPClient)) {
    return new SFTPClient(config)
  }

  this.config = config || {}
}

SFTPClient.prototype.MODES = require('ssh2').SFTP_OPEN_MODE
SFTPClient.prototype.CODES = require('ssh2').SFTP_STATUS_CODE

/**
* Creates connection and promise wrapper for sftp commands
*
* @param {callback} cmd_cb - callback for sftp, takes connection, reject and resolve cmb_cb(con, reject,resolve)
* @param {ssh2.Client} [session] - existing ssh2 connection, optional
*/
SFTPClient.prototype.sftpCmd = function sftpCmd (cmd_cb, session) {
  var self = this
  session = session || false
  // setup connection
  var conn
  if (session) {
    conn = session
  } else {
    conn = new Client()
  }

  // reject promise handler
  var rejected = function (err) {
    handleConn()
    return Promise.reject(err)
  }

  // resolve promise handler
  var resolved = function (val) {
    handleConn()
    return Promise.resolve(val)
  }

  // handle persisten connection
  var handleConn = function (retPromise) {
    if (!session) {
      conn.end()
      conn.destroy()
    }
    return retPromise
  }

  return new Promise(function (resolve, reject) {
    if (session) {
      conn.sftp(cmd_cb(resolve, reject))
    } else {
      conn.on('ready', function () {
        conn.sftp(cmd_cb(resolve, reject))
      })
      conn.on('error', function (err) {
        reject(err)
      })
      conn.connect(self.config)
    }
  // handle the persistent connection regardless of how promise fairs
  }).then(resolved, rejected)
}

/**
 * creates a new ssh2 session, short cut for
 * sshClient = require('ssh2')sshClient
 * session = new SFTPClient(config)
 *
 * @params {Object} config - valid ssh2 config
 * @return {Promise} returns a Promse with an ssh2 connection object if resovled
 */
SFTPClient.prototype.session = function session (conf) {
  return new Promise(function (resolve, reject) {
    var conn = new Client()
    conn.on('ready', function () {
      conn.removeAllListeners()
      resolve(conn)
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
SFTPClient.prototype.ls = function ls (location, session) {
  // create the lsCmd callback for this.sftpCmd
  var lsCmd = function (resolve, reject) {
    return function (err, sftp) {
      if (err) {
        reject(err)
        return
      }
      sftp.stat(location, function (err, stat) {
        if (err) {
          reject(err)
          return
        }
        var attrs = statToAttrs(stat)
        if (stat.isDirectory()) {
          sftp.readdir(location, function (err, list) {
            if (err) { reject(err) }
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
SFTPClient.prototype.stat = function stat (location, session) {
  // create the lsCmd callback for this.sftpCmd
  var statCmd = function (resolve, reject) {
    return function (err, sftp) {
      if (err) {
        reject(err)
        return
      }
      sftp.stat(location, function (err, stat) {
        if (err) {
          reject(err)
          return
        }
        var attrs = statToAttrs(stat)
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
 * get remote file contents into a Buffer
 *
 * @param {string} path - on filesystem to stat
 * @param {ssh2.Client} [session] - existing ssh2 connection, optional
 * @return {Promise} Promise with Buffer on resolve
 */
SFTPClient.prototype.getBuffer = function getBuffer (location, session) {
  var getBufferCmd = function (resolve, reject) {
    return function (err, sftp) {
      if (err) {
        reject(err)
        return
      }
      sftp.open(location, 'r', function (err, handle) {
        if (err) {
          reject(err)
          return
        }
        sftp.fstat(handle, function (err, stat) {
          if (err) { 
            reject(err)
            return
          }
          var bytes = stat.size
          var buffer = Buffer(bytes)
          buffer.fill(0)
          var cb = function (err, readBytes, offsetBuffer, position) {
            if (err) {
              reject(err)
              return
            }
            position = position + readBytes
            bytes = bytes - readBytes
            if (bytes < 1) {
              sftp.close(handle, function (err) {
                if (err) {
                  reject(err)
                } else {
                  resolve(buffer)
                }
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
 * put buffer to remote file
 *
 * @param {Buffer} - Buffer containing file contents
 * @param {string} path - on filesystem to stat
 * @param {ssh2.Client} [session] - existing ssh2 connection, optional
 * @return {Promise} Promise with boolean true if tranfer was successful
 */
SFTPClient.prototype.putBuffer = function putBuffer (buffer, location, session) {
  var putBufferCmd = function (resolve, reject) {
    return function (err, sftp) {
      if (err) {
        reject(err)
        return
      }
      sftp.open(location, 'w', function (err, handle) {
        if (err) {
          reject(err)
          return
        }
        sftp.write(handle, buffer, 0, buffer.length, 0, function (err) {
          if (err) {
            reject(err)
            return
          } else {
            resolve(true)
            sftp.close(handle, function (err) {
              if (err) {
                reject(err)
              } else {
                resolve(true)
              }
            })
          }
        })
      })
    }
  }
  return this.sftpCmd(putBufferCmd, session)
}

/**
 * get remote file and save it locally
 *
 * @param {string} remotepath - path to remote file
 * @param {string} localpath - destination path on local filesystem
 * @param {ssh2.Client} [session] - existing ssh2 connection, optional
 */
SFTPClient.prototype.get = function get (remote, local, session) {
  var getCmd = function (resolve, reject) {
    return function (err, sftp) {
      if (err) {
        reject(err)
        return
      }
      sftp.fastGet(remote, local, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
      })
    }
  }
  return this.sftpCmd(getCmd, session)
}

/**
 * put local file in remote path
 *
 * @param {string} localpath - path to local file
 * @param {string} remotepath - destination path on remote filesystem
 * @param {ssh2.Client} [session] - existing ssh2 connection, optional
 */
SFTPClient.prototype.put = function put (local, remote, session) {
  var putCmd = function (resolve, reject) {
    return function (err, sftp) {
      if (err) {
        reject(err)
        return
      }
      sftp.fastPut(local, remote, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
      })
    }
  }
  return this.sftpCmd(putCmd, session)
}

/**
 * remove remote file
 *
 * @param {string} path - remote file to remove
 * @param {ssh2.Client} [session] - existing ssh2 connection, optional
 */
SFTPClient.prototype.rm = function rm (location, session) {
  var rmCmd = function (resolve, reject) {
    return function (err, sftp) {
      if (err) {
        reject(err)
        return
      }
      sftp.unlink(location, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
      })
    }
  }
  return this.sftpCmd(rmCmd, session)
}

/**
 * move remote file from one spot to another
 *
 * @param {string} source - remote filesystem source path
 * @param {string} destination - remote filesystem desitnation path
 * @param {ssh2.Client} [session] - existing ssh2 connection, optional
 */
SFTPClient.prototype.mv = function rm (src, dest, session) {
  var mvCmd = function (resolve, reject) {
    return function (err, sftp) {
      if (err) {
        reject(err)
        return
      }
      sftp.rename(src, dest, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
      })
    }
  }
  return this.sftpCmd(mvCmd, session)
}

/**
 * removes and empty directory
 *
 * @param {string} path - remote directroy to remove
 * @param {ssh2.Client} [session] - existing ssh2 connection, optional
 */
SFTPClient.prototype.rmdir = function rmdir (path, session) {
  var rmdirCmd = function (resolve, reject) {
    return function (err, sftp) {
      if (err) {
        reject(err)
        return
      }
      sftp.rmdir(path, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
      })
    }
  }
  return this.sftpCmd(rmdirCmd, session)
}

/**
 *  makes a directory
 *
 * @param {string} path - remote directory to be created
 * @param {ssh2.Client} [session] - existing ssh2 connection, optional
 */
SFTPClient.prototype.mkdir = function mkdir (path, session) {
  var mkdirCmd = function (resolve, reject) {
    return function (err, sftp) {
      if (err) {
        reject(err)
        return
      }
      sftp.mkdir(path, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
      })
    }
  }
  return this.sftpCmd(mkdirCmd, session)
}

// export client
module.exports = SFTPClient

