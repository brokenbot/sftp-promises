# sftp-promises
SFTP Promise Wrapper for ssh2

Support basic SFTP transaction with promises, specifically for fronting SFTP with a web based API using something like Koa

# Usage

     var config = {host: 'localhost', username: 'user', password: 'pass' };
     var sftp = require('sftp-promises')(config);
     
     sftp.ls('~/').then(function(list) { console.log(list) })

# Support calls

sftp.ls(<string>remote\_path) returns a promise with an object descibing the path - implemented
sftp.getBuffer(<string>remote\_path) returns a promise with a buffer containing the file contents - not implemented
sftp.putBuffer(<Buffer>data, <string>remote\_path) returns a promise with a boolean, true if successful - not implemented
sftp.get(<string>remote\_path, <string>local\_path) returns a promise with a boolean, true if successful - not implemented
sftp.put(<string>local\_path, <string>remote\_path) returns a promise with a boolean, true if successful - not implemented


