var fs = require('fs');
var mocha = require('mocha');
var comocha = require('co-mocha');
// monkey patch mocha to handle generators
comocha(mocha);
var chai = require('chai');
chai.should();
// var expect = chai.expect;

var config = { 
  host: process.env.SFTPHOST || 'localhost', 
  port: process.env.SFTPPORT || 22, 
  username: process.env.SFTPUSER, 
  password: process.env.SFTPPASS 
};

var SFTPClient = require('../index');

var sftp = new SFTPClient(config);

// read in test.dat to buffer
var buffer = fs.readFileSync('test/fixtures/test.dat');

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

describe('tranfer files through buffers', function(){
  it('tranfer buffer to file', function *() {
    //this.timeout(0)  // enable for testing with large files
    var val = yield sftp.putBuffer(buffer, '/tmp/test.dat');
    val.should.be.true;
  });
  it('tranfer file to buffer', function *() {
    //this.timeout(0)  // enable for testing with large files
    var rbuffer = yield sftp.getBuffer('/tmp/test.dat');
    rbuffer.equals(buffer).should.be.true;
  })
})

describe('transfer files', function(){
	it('should transfer local file to remote', function *() {
    this.timeout(0)
    var val = yield sftp.put('test/test.dat', '/tmp/test.dat');
    val.should.be.true;
  })
  it('should transfer remote file locally', function *(){
    this.timeout(0)
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

