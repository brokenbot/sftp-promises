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
  it('should transfer remote file locally', function *(){
    var val = yield sftp.get('./.bash_profile', '/tmp/tranfertest.remove');
    val.should.be.true;
  })
  it('should transfer local file to remote', function *() {
    var val = yield sftp.put('/tmp/tranfertest.remove', './tranfertest.remove');
    val.should.be.true;
  })
})
