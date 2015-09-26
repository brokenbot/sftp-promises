var fs = require('fs');
var mocha = require('mocha');
var comocha = require('co-mocha');
// monkey patch mocha to handle generators
comocha(mocha);
var chai = require('chai');
chai.should();
// var expect = chai.expect;

var config = { host: process.env.SFTPHOST, username: process.env.SFTPUSER, password: process.env.SFTPPASS };

var sftp = require('../index')(config);

describe('stat dir and file', function(){
  it('should return a valid directroy object', function *(){
    var list = yield sftp.ls('/');
    list.should.be.an('object');
    list.type.should.equal('directory');
  })
  it('should return a valid file object', function *(){
    var list = yield sftp.ls('./.bash_profile');
    list.should.be.an('object');
    list.type.should.equal('file');
  })
})

describe('transfer files', function(){
	it('should transfer local file to remote', function *() {
    var val = yield sftp.put('test/test.dat', '/tmp/test.dat');
    val.should.be.true;
  })
  it('should transfer remote file locally', function *(){
    var val = yield sftp.get('/tmp/test.dat', '/tmp/transfertest.remove');
    val.should.be.true;
		// clean file from local system
		fs.unlink('/tmp/transfertest.remove');
  })
})

describe('move remote file', function(){
	it('should move a remote file', function *(){
		var val = yield sftp.mv('/tmp/test.dat', '/tmp/test.mv.dat');
		val.should.be.true;
	})
})

describe('remove remote file', function(){
	it('should remove a remote file', function *(){
		var val = yield sftp.rm('/tmp/test.mv.dat');
		val.should.be.true;
	})
})

