/* global describe, it */

var fs = require('fs')

var chai = require('chai')
var chaiAsPromised = require('chai-as-promised')
chai.use(chaiAsPromised)

var should = chai.should() // eslint-disable-line no-unused-vars

var config = {
  host: process.env.SFTPHOST || 'localhost',
  port: process.env.SFTPPORT || 22,
  username: process.env.SFTPUSER || 'vagrant',
  password: process.env.SFTPPASS || 'vagrant'
}

var invalidLogin = {
  host: process.env.SFTPHOST || 'localhost',
  port: process.env.SFTPPORT || 22,
  username: 'invaliduser',
  password: 'invalid password'
}

var SFTPClient = require('../index')

var sftp = new SFTPClient(config)

// read in test.dat to buffer
var buffer = fs.readFileSync('test/fixtures/test.dat')
var zbuffer = fs.readFileSync('test/fixtures/zero.test')

describe('SFTPClient()', function () {
  it('new SFTPClient(config) should return SFTPClient', function () {
    var Client = new SFTPClient(config)
    return Client instanceof SFTPClient
  })
  it('new SFTPClient(config).config should equal config', function () {
    var Client = new SFTPClient(config)
    Client.config.should.equal(config)
  })
  it('SFTPClient() should return SFTPClient instance', function () {
    var Client = SFTPClient()
    return Client instanceof SFTPClient
  })
  it('stat("./") with invalid login should fail', function () {
    var Client = SFTPClient(invalidLogin)
    return Client.stat('./').should.be.rejected
  }).timeout(10000)
  it('stat("./") with invalid config should fail', function () {
    var Client = SFTPClient()
    return Client.stat('./').should.be.rejected
  })
})

describe('session(config)', function () {
  it('session(config) should return valid session', function () {
    return sftp.session(config).should.be.fulfilled
  })
  it('should fail with due to invalid login', function () {
    return sftp.session(invalidLogin).should.be.rejected
  }).timeout(10000)
  it('session() should be rejected', function () {
    return sftp.session().should.be.rejected
  })
  it('stat("./", session) should be fullfilled', function () {
    return sftp.session(config).then(function (session) {
      return sftp.stat('./', session)
    }).should.be.fulfilled
  })
})

describe('putBuffer(buffer, remote)', function () {
  it('put(buffer, "/tmp/test.dat") should transfer buffer', function () {
    return sftp.putBuffer(buffer, '/tmp/test.dat').should.eventually.be.true
  })
  it('put(buffer, "/unwritable") should transfer reject', function () {
    return sftp.putBuffer(buffer, '/unwritable').should.be.rejected
  })
  it('put(buffer, "/tmp/zero.test") should put zero byte buffer', function () {
    return sftp.putBuffer(zbuffer, '/tmp/zero.test').should.eventually.be.true
  })
})

describe('getBuffer(remote)', function () {
  it('getBuffer("/tmp/test.dat") should tranfer file to buffer', function () {
    return sftp.getBuffer('/tmp/test.dat').then(function (rbuffer) {
      return rbuffer.equals(buffer)
    }).should.eventually.be.true
  })
  it('getBuffer("/nonexistantfile") should reject', function () {
    return sftp.getBuffer('/nonexistantfile').should.be.rejected
  })
  it('getBuffer("zero.test") should tranfer zero byte file', function () {
    return sftp.getBuffer('/tmp/zero.test').then(function (rbuffer) {
      return rbuffer.length
    }).should.eventually.equal(0)
  })
})

describe('put(local, remote)', function () {
  it('should transfer local file to remote', function () {
    return sftp.put('test/fixtures/test.dat', '/tmp/test.dat').should.eventually.be.true
  })
  it('put("test/fixtures/test.dat", "/unwritable") shoule reject', function () {
    return sftp.put('test/fixtures/test.dat', '/unwritable').should.be.rejected
  })
  it('put("/nonexistantfile", "/tmp/test.dat") should reject', function () {
    return sftp.put('/nonexistantfile', '/tmp/test.dat').should.be.rejected
  })
})

describe('get(remote, local)', function () {
  it('should transfer remote file locally', function () {
    return sftp.get('/tmp/test.dat', '/tmp/transfertest.remove').should.eventually.be.true
  })
  it('get("/tmp/test.dat", "/unwritable") should reject', function () {
    return sftp.get('/tmp/test.dat', '/unwritable').should.be.rejected
  })
  it('put("/nonexistantfile", "/tmp/test.dat") should reject', function () {
    return sftp.get('/nonexistantfile', '/tmp/test.dat').should.be.rejected
  })
})

describe('getStream(path, writableStream)', function () {
  it('getStream("/tmp/test.dat", writableStream) should be true', function () {
    var stream = fs.createWriteStream('/dev/null')
    return sftp.getStream('/tmp/test.dat', stream).should.eventually.be.true
  })
  it('getStream("/tmp/test.dat", nonWritableStream) should reject', function () {
    return sftp.getStream('/tmp/test.dat', 'notastream').should.be.rejected
  })
  it('getStream("/nonexistantfile", writableStream) should reject', function () {
    var stream = fs.createWriteStream('/dev/null')
    return sftp.getStream('/nonexistantfile', stream).should.be.rejected
  })
})

describe('putStream(path, readableStream)', function () {
  it('putStream("/tmp/test-stream.dat", readStream) should be true', function () {
    var stream = fs.createReadStream('test/fixtures/test.dat')
    return sftp.putStream('/tmp/test.dat', stream).should.eventually.be.true
  })
  it('putStream("/tmp/test.dat", nonReadableStream) should reject', function () {
    return sftp.putStream('/tmp/test.dat', 'notastream').should.be.rejected
  })
  it('puttStream("/nonewritable/location", writableStream) should reject', function () {
    var stream = fs.createReadStream('test/fixtures/test.dat')
    return sftp.putStream('/cantwritehere', stream).should.be.rejected
  })
})

describe('createReadStream(path)', function () {
  it('createReadStream("/tmp/test.dat") should be true', function () {
    var wstream = fs.createWriteStream('/dev/null')
    return sftp.createReadStream('/tmp/test.dat').then(function (rs) { rs.pipe(wstream) }).should.be.fulfilled
  })
  it('createReadStream("/nonexistantfile") should reject', function () {
    return sftp.createReadStream('/nonexistantfile').should.be.rejected
  })
})

describe('createWriteStream(path)', function () {
  it('createWriteStream("/tmp/test-stream.dat") should be fullfilled', function () {
    var stream = fs.createReadStream('test/fixtures/test.dat')
    return sftp.createWriteStream('/tmp/test-stream.dat').then(function (ws) { stream.pipe(ws) }).should.be.fulfilled
  })
  it('createWriteStream("/nonewritable/location") should reject', function () {
    return sftp.createWriteStream('/cantwritehere').should.be.rejected
  })
})

describe('mv(source, dest)', function () {
  it('mv("/tmp/test.dat", "/tmp/test.mv.dat") should move a remote file', function () {
    return sftp.mv('/tmp/test.dat', '/tmp/test.mv.dat').should.eventually.be.true
  })
  it('mv("/tmp/nonexistant.file","/tmp/test.dat") should fail', function () {
    return sftp.mv('/tmp/nonexistant.file', '/tmp/test.dat').should.be.rejected
  })
  it('mv("/tmp/test.mv.dat", "/nonwritable/location" should fail', function () {
    return sftp.mv('/tmp/test.mv.dat', '/cantwritehere').should.be.rejected
  })
})

describe('ls(path)', function () {
  it('ls("/") should return a valid directroy object', function () {
    return sftp.ls('./').should.eventually.contain({type: 'directory'})
  })
  it('ls("/tmp/zero.test") should return a valid file object', function () {
    return sftp.ls('/tmp/zero.test').should.eventually.contain({type: 'file'})
  })
  it('ls("/dev/null") should be of type other', function () {
    return sftp.ls('/dev/null').should.eventually.contain({type: 'other'})
  })
  it('ls("./nonexistantfile") should reject', function () {
    return sftp.ls('somenonexistant.file').should.be.rejected
  })
})

describe('stat(path)', function () {
  it('stat("/tmp") should be true', function () {
    return sftp.stat('/tmp').should.eventually.contain({type: 'directory'})
  })
  it('stat("/tmp/zero.test") should be file', function () {
    return sftp.stat('/tmp/zero.test').should.eventually.contain({type: 'file'})
  })
  it('stat("/dev/null") should be type other', function () {
    return sftp.stat('/dev/null').should.eventually.contain({type: 'other'})
  })
  it('stat("/root") should fail', function () {
    return sftp.stat('/root/.bashrc').should.be.rejected
  })
  it('stat("/nonexistantfile")', function () {
    return sftp.stat('/nonexistantfile').should.be.rejected
  })
})

describe('rm(path)', function () {
  it('should remove a remote file', function () {
    return sftp.rm('/tmp/test.mv.dat').should.eventually.be.true
  })
  it('should remove a remote file', function () {
    return sftp.rm('/tmp/zero.test').should.eventually.be.true
  })
  it('rm("/tmp") should reject', function () {
    return sftp.rm('/tmp').should.eventually.rejected
  })
})

describe('mkdir(path)', function () {
  it('mkdir("/tmp/testdir") should reslove', function () {
    return sftp.mkdir('/tmp/testdir').should.eventually.be.true
  })
  it('mkdir("/nonewritable") should reject', function () {
    return sftp.mkdir('/nowriteabledir').should.be.rejected
  })
})

describe('rmdir(path)', function () {
  it('rmdir("/tmp/testdir") should be true', function () {
    return sftp.rmdir('/tmp/testdir').should.eventually.be.true
  })
  it('rmdir("/tmp") should reject', function () {
    return sftp.rmdir('/tmp').should.be.rejected
  })
  it('rmdir("/nonexistentdir") should be rejected', function () {
    return sftp.rmdir('/noexistantdir').should.be.rejected
  })
})
