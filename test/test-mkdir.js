const SFTPClient = require('../index');
const chai = require('chai');
const expect = chai.expect;
const chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
chai.should();

describe('Unit: mkdir', function () {
    let client;
    let mockSession;
    let createdDirs = [];

    beforeEach(() => {
        createdDirs = [];
        client = new SFTPClient();
        mockSession = {
            sftp: (cb) => {
                cb(null, {
                    mkdir: (path, cb) => {
                        // Simulate simple filesystem
                        // existing: /existing
                        // missing: /missing

                        // If path is /existing/new, it succeeds (parent exists)
                        // If path is /missing/new, it fails (parent missing)

                        // We also track calls
                        createdDirs.push(path);

                        const parts = path.split('/').filter(p => p);
                        if (parts.length > 1) {
                            const parent = '/' + parts.slice(0, -1).join('/');
                            if (parent !== '/existing' && !createdDirs.includes(parent)) {
                                return cb(new Error('No such file'));
                            }
                        }
                        cb(null);
                    },
                    stat: (path, cb) => {
                        // Mock stat if needed
                        if (path === '/existing' || createdDirs.includes(path)) {
                            cb(null, { isDirectory: () => true });
                        } else {
                            cb(new Error('No such file'));
                        }
                    }
                });
            },
            on: () => {},
            removeListener: () => {}
        };
    });

    it('should create directory if parent exists', function () {
        return client.mkdir('/existing/new', mockSession).should.be.fulfilled;
    });

    it('should fail to create directory if parent does not exist (default behavior)', function () {
        return client.mkdir('/missing/new', mockSession).should.be.rejectedWith('No such file');
    });

    it('should create directory recursively if parent does not exist and recursive option is true', function () {
        return client.mkdir('/missing/new', true, mockSession).should.be.fulfilled;
    });

    it('should create deep directory recursively', function () {
        return client.mkdir('/missing/one/two/three', true, mockSession).should.be.fulfilled;
    });
});
