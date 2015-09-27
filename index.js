var Client = require('ssh2').Client;;

var statToAttrs = function (stats) {
  var attrs = {};
  for (var attr in stats) {
    if (stats.hasOwnProperty(attr)) {
      attrs[attr] = stats[attr];
    }
  }
  return attrs;
}

function sftpClient(config) {
  if (!(this instanceof sftpClient)) {
    return new sftpClient(config);
  }

  this.config = config || {};

}

sftpClient.prototype.MODES = require('ssh2').SFTP_OPEN_MODE;
sftpClient.prototype.CODES = require('ssh2').SFTP_STATUS_CODE;

sftpClient.prototype.sftpCmd = function sftpCmd(cmd) {
  var self = this;
  var p = new Promise(function (resolve, reject) {
    var conn = new Client();
    conn.on('ready', function () {
      conn.sftp(cmd(conn, resolve, reject))
    }).connect(self.config);
    conn.on('error', function (err) {
      reject(err);
      conn.end();
    })
  })
  return p;
}

sftpClient.prototype.ls = function ls(location) {
  return this.sftpCmd(function (conn, resolve, reject) {
    var cmd = function (err, sftp) {
      sftp.stat(location, function (err, stat) {
        if (err) {
          reject(err);
          conn.end()
          return false;
        };
        var attrs = statToAttrs(stat);
        if (stat.isDirectory()) {
          sftp.readdir(location, function (err, list) {
            if (err) { reject(err) };
            resolve({ path: location, type: 'directory', attrs: attrs, entries: list });
            conn.end();
          });
        } else if (stat.isFile()) {
          resolve({ path: location, type: 'file', attrs: attrs });
          conn.end();
        } else {
          reject('not a file or directory');
          conn.end();
        }
      });
    }
    return cmd;
  })
}

sftpClient.prototype.getBuffer = function getBuffer(location) {
  return this.sftpCmd(function (conn, resolve, reject) {
    var cmd = function (err, sftp) {
      sftp.open(location, 'r', function (err, handle) {
        if (err) {
          reject(err);
          conn.end();
          return;
        }
        sftp.fstat(handle, function (err, stat) {
          if (err) { reject(err); conn.end(); return false }
          var bytes = stat.size;
          var buffer = Buffer(bytes);
          buffer.fill(0);
          var cb = function (err, readBytes, offsetBuffer, position) {
            if (err) {
              reject(err);
              sftp.close();
              conn.end();
              return false;
            }
            position = position + readBytes;
            bytes = bytes - readBytes;
            if (bytes < 1) {
              sftp.close(handle, function (err) {
                conn.end();
                if (err) {
                  reject(err);
                  return false;
                } else {
                  resolve(buffer);
                  return;
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
    return cmd
  })
}

sftpClient.prototype.putBuffer = function putBuffer(buffer, location) {
  return this.sftpCmd(function (conn, resolve, reject) {
    var cmd = function (err, sftp) {
      sftp.open(location, 'w', function (err, handle) {
        if (err) {
          reject(err);
          conn.end();
          return;
        }
        sftp.write(handle, buffer, 0, buffer.length, 0, function (err) {
          if (err) {
            reject(err);
            conn.end();
            return false;
          } else {
            resolve(true)
            sftp.close(handle, function (err) {
              conn.end();
              if (err) {
                reject(err);
                return false;
              } else {
                resolve(true);
                return true;
              }
            })
          }
        })
      })
    }
    return cmd;
  })
}

sftpClient.prototype.get = function get(remote, local) {
  return this.sftpCmd(function (conn, resolve, reject) {
    var cmd = function (err, sftp) {
      sftp.fastGet(remote, local, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
        conn.end();
      });
    }
    return cmd;
  })
}

sftpClient.prototype.put = function put(local, remote) {
  return this.sftpCmd(function (conn, resolve, reject) {
    var cmd = function (err, sftp) {
      conn.sftp(function (err, sftp) {
        sftp.fastPut(local, remote, function (err) {
          if (err) {
            reject(err)
          } else {
            resolve(true)
          }
          conn.end();
        });
      });
    }
    return cmd;
  })
}

sftpClient.prototype.rm = function rm(location) {
  return this.sftpCmd(function (conn, resolve, reject) {
    var cmd = function (err, sftp) {
      sftp.unlink(location, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
        conn.end();
      });
    }
    return cmd
  })
}

sftpClient.prototype.mv = function rm(src, dest) {
  return this.sftpCmd(function (conn, resolve, reject) {
    var cmd = function (err, sftp) {
      sftp.rename(src, dest, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve(true)
        }
        conn.end();
      });
    }
    return cmd;
  })
}

module.exports = sftpClient
