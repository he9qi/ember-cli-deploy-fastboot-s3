/* eslint-env node, mocha */
'use strict';

const RSVP = require('rsvp');
const assert = require('../helpers/assert');
const fs = require('fs');
const stat = RSVP.denodeify(fs.stat);
const path = require('path');
const unzip = require('unzip');
const del = require('del');
const DIST_DIR = 'dist';

const stubProject = {
  name() {
    return 'my-project';
  }
};


describe('fastboot-s3 plugin', () => {
  let subject, mockUi, plugin, fullConfig, s3Client;

  beforeEach(() => {
    s3Client = {
      putObject: function() {
        return {
          promise: function() {
            return RSVP.Promise.resolve();
          }
        };
      },
      getObject: function() {
        return {
          promise: function() {
            return RSVP.Promise.resolve();
          }
        };
      },
      headObject: function(){
        return {
          promise: function() {
            return RSVP.Promise.resolve();
          }
        }
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

  afterEach(() => del('./tmp/*'));

  describe('defaultConfig', () => {
    it('has name', () => {
      assert.equal(plugin.name, 'fastboot-s3');
    });

    it('has default config', () => {
      assert.equal(plugin.defaultConfig.archivePath, 'tmp/dist');
      assert.equal(
        plugin.defaultConfig.deployInfo,
        'fastboot-deploy-info.json'
      );
    });
  });

  describe('required config', () => {
    let context;

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

    it('warns about missing bucket', () => {
      delete context.config['fastboot-s3'].bucket;

      let plugin = subject.createDeployPlugin({
        name: 'fastboot-s3'
      });
      plugin.beforeHook(context);
      assert.throws(
        function(/*error*/) {
          plugin.configure(context);
        }
      );
      let messages = mockUi.messages.reduce(function(previous, current) {
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
      let messages = mockUi.messages.reduce(function(previous, current) {
        if (/You must configure either an 'endpoint' or a 'region' to use the AWS.S3 client./.test(current)) {
          previous.push(current);
        }

        return previous;
      }, []);

      assert.equal(messages.length, 1);
    });
  });

  describe('resolving s3Client from the pipline', () => {
    it('uses the context value', () => {
      const config = fullConfig;
      const s3Client = {};
      const context = {
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

  describe('resolving distDir from the pipeline', () => {
    it('uses the context value', () => {
      const config = fullConfig;
      const context = {
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

  describe('resolving revisionKey from the pipeline', () => {
    it("uses the context value if it exists and commandOptions doesn't", function() {
      const config = fullConfig;
      const context = {
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
      const config = fullConfig;
      const context = {
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

  describe('didPrepare hook', () => {
    it('creates a tarball of the dist folder with revision', function() {
      const config = fullConfig;
      const context = {
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

      const archivePath = context.config['fastboot-s3'].archivePath;
      const archiveName = 'dist-abcd.zip';
      const fileName = path.join(archivePath, archiveName);
      const extractedDir = path.join(archivePath, DIST_DIR);

      return assert.isFulfilled(plugin.didPrepare(context))
        .then(() => stat(fileName))
        .then((stats) => assert.ok(stats.isFile()))
        .then(() => {
          return new RSVP.Promise(resolve => {
            fs.createReadStream(fileName)
              .pipe(
                unzip
                  .Extract({ path: archivePath })
                  .on('close', resolve)
              );
          });
        })
        .then(() => stat(extractedDir))
        .then((stats) => assert.ok(stats.isDirectory()));
    });
  });

  describe('upload', () => {
    let context;

    beforeEach(() => {
      const config = {
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

    it('resolves if all uploads succeed', () => {
      plugin.beforeHook(context);
      plugin.configure(context);
      plugin.setup(context);
      plugin.didPrepare(context);

      return assert.isFulfilled(plugin.upload(context))
        .then(() => {
          assert.equal(mockUi.messages.length, 11);

          let messages = mockUi.messages.reduce((previous, current) => {
            if (/- ✔  (dist-abcd\.zip)/.test(current)) {
              previous.push(current);
            }

            return previous;
          }, []);

          assert.equal(messages.length, 1);
        });
    });

    it('prints an error message if the upload errors', () => {
      const context = {
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

  describe('activate hook', () => {
    it('prints success message if activation succeeds', () => {

      const context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': fullConfig
        },
        commandOptions: {
          revisionKey: '123456'
        },
        distDir: `${process.cwd()}/tests/fixtures/${DIST_DIR}`,
        revisionData: {
          revisionKey: 'revABCD'
        },
        s3Client: {
          putObject: (data) => {
            return {
              promise: function() {
                if (/revABCD/.test(data.Body)) {
                  return RSVP.Promise.resolve('Activated revision ok');
                } else {
                  return RSVP.Promise.reject('Activated revision not ok');
                }
              }
            };
          },
          headObject: (s3, callback) => {
            callback(null,
              {
                LastModified: new Date(),
              }
            );
          },
          getObject: (s3, callback) => {
            callback({code: 'NotFound'}, null);
          }
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      plugin.setup(context);

      const promise = plugin.activate(context);

      return assert
        .isFulfilled(promise)
        .then(() => assert.ok(/activated revison revABCD/.test(mockUi.messages.slice(-1))));
    });
  });

  describe('didDeploy hook', function() {
    it('prints message about lack of activation when revision has not been activated', function() {
      let messageOutput = '';

      const context = {
        deployTarget: 'qa',
        ui: {
          write: function(message){
            messageOutput = messageOutput + message;
          },
          writeLine: function(message){
            messageOutput = messageOutput + message + '\n';
          }
        },
        project: stubProject,
        config: {
          'fastboot-s3': fullConfig
        },
        revisionData: {
          revisionKey: '123abc',
        }
      };
      plugin.beforeHook(context);
      plugin.configure(context);
      plugin.beforeHook(context);
      plugin.didDeploy(context);
      assert.match(messageOutput, /Deployed but did not activate revision 123abc./);
      assert.match(messageOutput, /To activate, run/);
      assert.match(messageOutput, /ember deploy:activate qa --revision=123abc/);
    });
  });
});
