/* eslint-env node, mocha */
'use strict';

var RSVP = require('rsvp');
var assert = require('../helpers/assert');
var fs = require('fs');
var stat = RSVP.denodeify(fs.stat);
var path = require('path');
var unzip = require('unzip');

var DIST_DIR = 'dist';

var stubProject = {
  name: function() {
    return 'my-project';
  }
};

describe('fastboot-s3 plugin', function() {
  var subject, mockUi, plugin, fullConfig, s3Client;

  beforeEach(function() {
    s3Client = {
      putObject: function() {
        return {
          promise: function() {
            return RSVP.Promise.resolve();
          }
        };
      }
    };
    subject = require('../../index');
    plugin = subject.createDeployPlugin({
      name: 'fastboot-s3'
    });
    mockUi = {
      verbose: true,
      messages: [],
      write: function() {},
      writeLine: function(message) {
        this.messages.push(message);
      }
    };
    fullConfig = {
      bucket: 'some bucket',
      region: 'some region',
      endpoint: 'some endpoint',
      prefix: 'some prefix'
    };
  });

  describe('defaultConfig', function() {
    it('has name', function() {
      assert.equal(plugin.name, 'fastboot-s3');
    });

    it('has default config', function() {
      assert.equal(plugin.defaultConfig.archivePath, 'tmp/dist');
      assert.equal(
        plugin.defaultConfig.deployInfo,
        'fastboot-deploy-info.json'
      );
    });
  });

  describe('required config', function() {
    var context;

    beforeEach(function() {
      context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': fullConfig
        },
        commandOptions: {
          revision: 'abcd'
        },
        revisionData: {
          revisionKey: 'something-else'
        }
      };
    });

    it('warns about missing bucket', function() {
      delete context.config['fastboot-s3'].bucket;

      var plugin = subject.createDeployPlugin({
        name: 'fastboot-s3'
      });
      plugin.beforeHook(context);
      assert.throws(
        function(/*error*/) {
          plugin.configure(context);
        }
      );
      var messages = mockUi.messages.reduce(function(previous, current) {
        if (/- Missing required config: `bucket`/.test(current)) {
          previous.push(current);
        }

        return previous;
      }, []);

      assert.equal(messages.length, 1);
    });

    it('warns about missing region and endpoint', function() {
      delete context.config['fastboot-s3'].region;
      delete context.config['fastboot-s3'].endpoint;

      var plugin = subject.createDeployPlugin({
        name: 'fastboot-s3'
      });
      plugin.beforeHook(context);
      assert.throws(
        function(/*error*/) {
          plugin.configure(context);
        }
      );
      var messages = mockUi.messages.reduce(function(previous, current) {
        if (/You must configure either an 'endpoint' or a 'region' to use the AWS.S3 client./.test(current)) {
          previous.push(current);
        }

        return previous;
      }, []);

      assert.equal(messages.length, 1);
    });
  });

  describe('resolving s3Client from the pipline', function() {
    it('uses the context value', function() {
      var config = fullConfig;
      var s3Client = {};
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': config
        },
        commandOptions: {},
        distDir: 'tmp/dist',
        s3Client: s3Client
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      assert.typeOf(config.s3Client, 'function');
      assert.equal(config.s3Client(context), s3Client);
    });
  });

  describe('resolving distDir from the pipeline', function() {
    it('uses the context value', function() {
      var config = fullConfig;
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': config
        },
        commandOptions: {},
        distDir: 'tmp/dist'
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      assert.typeOf(config.distDir, 'function');
      assert.equal(config.distDir(context), 'tmp/dist');
    });
  });

  describe('resolving revisionKey from the pipeline', function() {
    it("uses the context value if it exists and commandOptions doesn't", function() {
      var config = fullConfig;
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': config
        },
        commandOptions: {},
        revisionData: {
          revisionKey: 'something-else'
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      assert.typeOf(config.revisionKey, 'function');
      assert.equal(config.revisionKey(context), 'something-else');
    });

    it('uses the commandOptions value if it exists', function() {
      var config = fullConfig;
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': config
        },
        commandOptions: {
          revision: 'abcd'
        },
        revisionData: {
          revisionKey: 'something-else'
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      assert.typeOf(config.revisionKey, 'function');
      assert.equal(config.revisionKey(context), 'abcd');
    });
  });

  describe('didPrepare hook', function() {
    it('creates a tarball of the dist folder with revision', function() {
      var config = fullConfig;
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': config
        },
        commandOptions: {},
        distDir: process.cwd() + '/tests/fixtures/' + DIST_DIR,
        revisionData: {
          revisionKey: 'abcd'
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);

      var archivePath = context.config['fastboot-s3'].archivePath;

      var archiveName = 'dist-abcd.zip';

      return assert.isFulfilled(plugin.didPrepare(context)).then(function() {
        var fileName = path.join(archivePath, archiveName);

        return stat(fileName)
          .then(function(stats) {
            assert.ok(stats.isFile());
          })
          .then(function() {
            return new RSVP.Promise(resolve => {
              let asd = fs
                .createReadStream(fileName)
                .pipe(unzip.Extract({ path: archivePath }));
              asd.on('close', resolve());
            });
          })
          .then(function() {
            var extractedDir = archivePath + '/' + DIST_DIR;
            return stat(extractedDir).then(function(stats) {
              assert.ok(stats.isDirectory());
            });
          });
      });
    });
  });

  describe('upload', function() {
    var context;

    beforeEach(function() {
      var config = {
        s3Client: s3Client,
        region: 'region',
        bucket: 'bucket'
      };
      context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': config
        },
        commandOptions: {},
        distDir: process.cwd() + '/tests/fixtures/' + DIST_DIR,
        revisionData: {
          revisionKey: 'abcd'
        }
      };
    });

    it('resolves if all uploads succeed', function() {
      plugin.beforeHook(context);
      plugin.configure(context);
      plugin.setup(context);
      plugin.didPrepare(context);

      return assert.isFulfilled(plugin.upload(context)).then(function() {
        assert.equal(mockUi.messages.length, 11);

        var messages = mockUi.messages.reduce(function(previous, current) {
          if (/- ✔  (dist-abcd\.zip)/.test(current)) {
            previous.push(current);
          }

          return previous;
        }, []);

        assert.equal(messages.length, 1);
      });
    });

    it('prints an error message if the upload errors', function() {
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': fullConfig
        },
        commandOptions: {},
        distDir: process.cwd() + '/tests/fixtures/' + DIST_DIR,
        revisionData: {
          revisionKey: 'abcd'
        },
        s3Client: {
          putObject: function() {
            return {
              promise: function() {
                return RSVP.Promise.reject(
                  new Error('something bad went wrong')
                );
              }
            };
          }
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      plugin.setup(context);
      plugin.didPrepare(context);

      return assert.isRejected(plugin.upload(context)).then(function() {
        assert.match(
          mockUi.messages[mockUi.messages.length - 1],
          /- Error: something bad went wrong/
        );
      });
    });
  });

  describe('activate hook', function() {
    it('prints success message if activation succeeds', function() {
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': fullConfig
        },
        commandOptions: {
          revisionKey: '1234'
        },
        distDir: process.cwd() + '/tests/fixtures/' + DIST_DIR,
        revisionData: {
          revisionKey: 'revABCD'
        },
        s3Client: {
          putObject: function(data) {
            return {
              promise: function() {
                if (/revABCD/.test(data.Body)) {
                  return RSVP.Promise.resolve('Activated revision ok');
                } else {
                  return RSVP.Promise.reject('Activated revision not ok');
                }
              }
            };
          }
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      plugin.setup(context);

      var promise = plugin.activate(context);

      return assert.isFulfilled(promise).then(function() {
        assert.ok(/activated revison revABCD/.test(mockUi.messages.slice(-1)));
      });
    });
  });
});
