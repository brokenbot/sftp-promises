# sftp-promises

[![NPM version](http://img.shields.io/npm/v/sftp-promises.svg?style=flat)]

>SFTP Promise Wrapper for ssh2

Support basic SFTP transaction with promises, specifically for fronting SFTP with a web based API using something like Koa

### Warning
Each request will create a new conneciton and close it when finished, this is by design as its intended to be used in stateless web applications.  As such care should exercised when using on high traffic systems to avoid too many connections to SFTP server and general connection overhead.  

# Usage
```javascript
var config = {host: 'localhost', username: 'user', password: 'pass' };
var SFTPClient = require('sftp-promises');
var sftp = new SFTPClient(config);
     
sftp.ls('~/').then(function(list) { console.log(list) })
```
	
config options are the same as [ssh2](https://github.com/mscdex/ssh2) config options.

# Supported calls

* sftp.ls(\<string>remote\_path) returns a promise with an object descibing the path
* sftp.getBuffer(\<string>remote\_path) returns a promise with a buffer containing the file contents
* sftp.putBuffer(\<Buffer>data, <string>remote\_path) returns a promise with a boolean, true if successful
* sftp.get(\<string>remote\_path, <string>local\_path) returns a promise with a boolean, true if successful
* sftp.put(\<string>local\_path, <string>remote\_path) returns a promise with a boolean, true if successful
* sftp.rm(\<string>location) returns a promise with a boolean, true if successful
* sftp.mv(\<string>src, <string>dest) returns a promise with a boolean, true if successful

# Planned Features
* Streaming implementation for get and put
* The option for persistent connections


