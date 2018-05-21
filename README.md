# sftp-promises

[![NPM version](http://img.shields.io/npm/v/sftp-promises.svg?style=flat)](https://npmjs.org/package/sftp-promises)[![Coverage Status](https://coveralls.io/repos/brokenbot/sftp-promises/badge.svg?branch=master&service=github)](https://coveralls.io/github/brokenbot/sftp-promises?branch=master)[![Build Status](https://travis-ci.org/brokenbot/sftp-promises.svg?branch=master)](https://travis-ci.org/brokenbot/sftp-promises)

>SFTP Promise Wrapper for ssh2

Support basic SFTP transaction with promises, specifically for fronting SFTP with a web based API using something like Koa

### Warning
By default each request will create a new conneciton and close it when finished, this is by design as its intended to be used in stateless web applications.  As such care should exercised when using on high traffic systems to avoid too many connections to SFTP server and general connection overhead.  

# Usage
_**One connection per call**_

```javascript
var config = {host: 'localhost', username: 'user', password: 'pass' };
var SFTPClient = require('sftp-promises');
var sftp = new SFTPClient(config);
     
sftp.ls('.').then(function(list) { console.log(list) })
```

_**Persistent Session calls (Experimental)**_

```javascript
var config = {host: 'localhost', username: 'user', password: 'pass' };
var SFTPClient = require('sftp-promises');
var sftp = new SFTPClient();

// get session
var session = sftp.session(config).then(function(ftpSession) { session = ftpSession })
...code to ensure session is ready...  
sftp.ls('.', session).then(function(list) { console.log(list) })

// close socket
session.end()
```

config options are the same as [ssh2](https://github.com/mscdex/ssh2) config options.

# Supported calls
> All calls take an optional ssh2 Connction object as the final arguement for using persistent session.

**sftp.stat(\<string>remote\_path, [ssh2.Connection]session)** returns a promise with on object containing path attributes  
**sftp.ls(\<string>remote\_path, [ssh2.Connection]session)** returns a promise with an object descibing the path  
**sftp.getBuffer(\<string>remote\_path, [ssh2.Connection]session)** returns a promise with a buffer containing the file contents  
**sftp.putBuffer(\<Buffer>data, \<string>remote\_path, [ssh2.Connection]session)** returns a promise with a boolean, true if successful  
**sftp.get(\<string>remote\_path, \<string>local\_path, [ssh2.Connection]session)** returns a promise with a boolean, true if successful  
**sftp.put(\<string>local\_path, \<string>remote\_path, [ssh2.Connection]session)** returns a promise with a boolean, true if successful  
**sftp.rm(\<string>location, [ssh2.Connection]session)** returns a promise with a boolean, true if successful  
**sftp.mv(\<string>src, \<string>dest, [ssh2.Connection]session)** returns a promise with a boolean, true if successful 
**sftp.mkdir(\<string>path, [ssh2.Connection]session)** returns a promise with a boolean, true if successful 
**sftp.rmdir(\<string>path, [ssh2.Connection]session)** returns a promise with a boolean, true if successful 
**sftp.getStream(\<string>path, <writableStream>writableStream, [ssh2.Connection]session)** returns a promise with a boolean, true if stream write completed  
**sftp.putStream(\<string>path, <writableStream>writableStream, [ssh2.Connection]session)** returns a promise with a boolean, true is stream write completed  
**sftp.createReadStream(\<string>path, [ssh2.Connection]session)** returns a promise with a readStream (ssh session will terminate on streams events close and error)  
**sftp.createWriteStream(\<string>path, [ssh2.Connection]session)** returns a promise with a writeStream (ssh session will terminate on streams events close and error)  


# ToDo
* better testing of sessions
* validate sftp session is actually a valid ssh session
* mkdir recursive
* rmdir recursive
* ability to add options to be passed to underlying ssh2 connections
* better documentation
