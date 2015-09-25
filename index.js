var Client = require('ssh2').Client;
// var Promise = require('bluebird');

var statToAttrs = function(stats) {
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

        ls: function (location) {
			var self = this;
			var p = new Promise(function (resolve, reject) {
				var conn = new Client();
				conn.on('ready', function () {
					console.log('reading %s', location);
					conn.sftp(function (err, sftp) {
						sftp.stat(location, function(err, stat) {
							if (err) { reject(err) };
							var attrs = statToAttrs(stat);
							if (stat.isDirectory()) {
								sftp.readdir(location, function (err, list) {
									console.log('dir stats: %s', stat)
									if (err) { reject(err) };
									resolve({ path: location, type: 'directory', attrs: attrs , entries: list});
									conn.end();
								});
							} else if(stat.isFile()) {
								resolve({ path: location, type: 'file', attrs: attrs });
							} else {
								reject('not a file or directory')
							}
						});
					});
				}).connect(self.config);
				//conn.on('error', reject(err))
			})
			
			return p;

		},
		
		get: function (location) {
			var self = this;
			throw ('not yet implemented');
		},
		
		put: function (buffer, location) {
			var self = this;
			throw ('not yet impletmented');
		},
		
		stat: function stat(path) {
			var self = this;
			return p = new Promise(function (resolve, reject) {
				var conn = new Client();
				conn.on('ready', function() {
					console.log('stating %s', path);
					conn.sftp(function (err, sftp) {
						sftp.stat(path, function(err, stat) {
							if(err) { reject(err) };
							resolve(stat)
							conn.end();
						});
					});
				}).connect(self.config);
			});
		}
	};

	return sftpClient;
};
