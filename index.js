var Client = require('ssh2').Client;
// var Promise = require('bluebird');

var statToAttrs = function (stats) {
  var attrs = {};
  for (var attr in stats) {
    if (stats.hasOwnProperty(attr)) {
      attrs[attr] = stats[attr];
    }
  }
  return attrs;
}

module.exports = function (config) {

  var sftpClient = {

		config: config,


		ls: function ls(location) {
			var self = this;
      return new Promise(function (resolve, reject) {
        var conn = new Client();
        conn.on('ready', function () {
          //console.log('reading %s', location);
          conn.sftp(function (err, sftp) {
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
          });
        }).connect(self.config);
        conn.on('error', function (err) {
          conn.end();
          reject(err);
        })
      })

    },

    getBuffer: function getBuffer(location) {
      var self = this;
      throw ('not yet implementd');
    },

    putBuffer: function putBuffer(buffer, location) {
      var self = this;
      throw ('not yet implemented');
    },

    get: function get(remote, local) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var conn = new Client();
        conn.on('ready', function () {
          conn.sftp(function (err, sftp) {
            sftp.fastGet(remote, local, function (err) {
              if (err) {
                reject(err)
              } else {
                resolve(true)
              }
              conn.end();
            });
          });
        }).connect(self.config);
				conn.on('error', function (err) {
          conn.end();
          reject(err);
        })
      });
    },

    put: function put(local, remote) {
      var self = this;
      return new Promise(function (resolve, reject) {
        var conn = new Client();
        conn.on('ready', function () {
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
        }).connect(self.config);
				conn.on('error', function (err) {
          conn.end();
          reject(err);
        })
      });
    },

		rm: function rm(location) {
			var self = this;
			return new Promise(function (resolve, reject) {
        var conn = new Client();
        conn.on('ready', function () {
          conn.sftp(function (err, sftp) {
            sftp.unlink(location, function (err) {
              if (err) {
                reject(err)
              } else {
                resolve(true)
              }
              conn.end();
            });
          });
        }).connect(self.config);
				conn.on('error', function (err) {
          conn.end();
          reject(err);
        })
			})
		},

	mv: function rm(src, dest) {
		var self = this;
		return new Promise(function (resolve, reject) {
			var conn = new Client();
			conn.on('ready', function () {
				conn.sftp(function (err, sftp) {
					sftp.rename(src, dest, function (err) {
						if (err) {
							reject(err)
						} else {
							resolve(true)
						}
						conn.end();
					});
				});
			}).connect(self.config);
			conn.on('error', function (err) {
				conn.end();
				reject(err);
			})
		})
	}
	
};

return sftpClient;
};
