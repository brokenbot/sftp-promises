const chai = require('chai');
const chaiAsPromised = require('chai-as-promised');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const fs = require('fs');
const Stream = require('stream');

chai.use(chaiAsPromised);
const should = chai.should();

describe('SFTPClient with Mocks', function () {
  let SFTPClient;
  let sshClientMock;
  let sftpMock;
  let connMock;

  beforeEach(function () {
    sftpMock = {
      stat: sinon.stub(),
      readdir: sinon.stub(),
      open: sinon.stub(),
      fstat: sinon.stub(),
      read: sinon.stub(),
      close: sinon.stub(),
      write: sinon.stub(),
      fastGet: sinon.stub(),
      fastPut: sinon.stub(),
      unlink: sinon.stub(),
      rename: sinon.stub(),
      rmdir: sinon.stub(),
      mkdir: sinon.stub(),
      createReadStream: sinon.stub(),
      createWriteStream: sinon.stub(),
      realpath: sinon.stub()
    };

    connMock = {
      on: sinon.stub(),
      connect: sinon.stub(),
      end: sinon.stub(),
      destroy: sinon.stub(),
      sftp: sinon.stub(),
      removeAllListeners: sinon.stub()
    };

    // Simulate ready event when connect is called
    connMock.connect.callsFake(function() {
        // Trigger ready event handler if registered
        const readyHandler = connMock.on.getCalls().find(call => call.args[0] === 'ready');
        if (readyHandler) {
            readyHandler.args[1]();
        }
    });

    // Simulate sftp creation
    connMock.sftp.yields(null, sftpMock);

    sshClientMock = {
      Client: sinon.stub().returns(connMock),
      SFTP_OPEN_MODE: {},
      SFTP_STATUS_CODE: {}
    };

    SFTPClient = proxyquire('../index', {
      'ssh2': sshClientMock
    });
  });

  it('should list directory', function () {
    sftpMock.stat.yields(null, { isDirectory: () => true, isFile: () => false });
    sftpMock.readdir.yields(null, [{ filename: 'file1' }]);

    const sftp = new SFTPClient({});
    return sftp.ls('.').should.eventually.satisfy(function(result) {
        return result.type === 'directory' && Array.isArray(result.entries);
    });
  });

  it('should get buffer', function() {
    const handle = Buffer.from('handle');
    const fileSize = 5;

    sftpMock.open.yields(null, handle);
    sftpMock.fstat.yields(null, { size: fileSize });
    sftpMock.read.callsFake((h, buf, off, len, pos, cb) => {
        buf.fill('a');
        cb(null, fileSize, buf, pos);
    });
    sftpMock.close.yields(null);

    const sftp = new SFTPClient({});
    return sftp.getBuffer('test').should.eventually.be.instanceOf(Buffer);
  });

  it('should put buffer', function() {
    sftpMock.open.yields(null, Buffer.from('handle'));
    sftpMock.write.yields(null);
    sftpMock.close.yields(null);

    const sftp = new SFTPClient({});
    return sftp.putBuffer(Buffer.from('test'), 'remote').should.eventually.be.true;
  });

  it('should fastGet', function() {
    sftpMock.fastGet.yields(null);
    const sftp = new SFTPClient({});
    return sftp.get('remote', 'local').should.eventually.be.true;
  });

  it('should fastPut', function() {
    sftpMock.fastPut.yields(null);
    const sftp = new SFTPClient({});
    return sftp.put('local', 'remote').should.eventually.be.true;
  });

  it('should mkdir', function() {
    sftpMock.mkdir.yields(null);
    const sftp = new SFTPClient({});
    return sftp.mkdir('dir').should.eventually.be.true;
  });

  it('should rmdir', function() {
    sftpMock.rmdir.yields(null);
    const sftp = new SFTPClient({});
    return sftp.rmdir('dir').should.eventually.be.true;
  });

  it('should delete file', function() {
    sftpMock.unlink.yields(null);
    const sftp = new SFTPClient({});
    return sftp.rm('file').should.eventually.be.true;
  });

  it('should rename file', function() {
    sftpMock.rename.yields(null);
    const sftp = new SFTPClient({});
    return sftp.mv('src', 'dest').should.eventually.be.true;
  });
});
