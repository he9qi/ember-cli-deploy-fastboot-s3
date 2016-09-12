/* jshint node: true */
/* jshint jasmine: true */
'use strict';

var Promise = require('ember-cli/lib/ext/promise');
var assert  = require('../helpers/assert');
var fs      = require('fs');
var stat    = Promise.denodeify(fs.stat);
var path    = require('path');
var targz   = require('tar.gz');

var DIST_DIR = 'dist';

var stubProject = {
  name: function(){
    return 'my-project';
  }
};

describe('fastboot-s3 plugin', function() {
  var subject, mockUi, plugin, requiredConfig, s3Client;

  beforeEach(function() {
    s3Client = {
      putObject: function() {
        return {
          promise: function() {
            return Promise.resolve();
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
      write: function() { },
      writeLine: function(message) {
        this.messages.push(message);
      }
    };
    requiredConfig = {
      bucket: "some bucket",
      region: "some region"
    };
  });

  describe('defaultConfig', function() {
    it('has name', function() {
      assert.equal(plugin.name, "fastboot-s3");
    });

    it('has default config', function() {
      assert.equal(plugin.defaultConfig.archivePath, 'tmp/deploy-archive');
      assert.equal(plugin.defaultConfig.deployInfo, 'fastboot-deploy-info.json');
    });
  });

  describe('required config', function() {
    var context;

    beforeEach(function() {
      context = {
        ui: mockUi,
        project: stubProject,
        config: {
          'fastboot-s3': requiredConfig
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
      assert.throws(function(error){
        plugin.configure(context);
      });
      var messages = mockUi.messages.reduce(function(previous, current) {
        if (/- Missing required config: `bucket`/.test(current)) {
          previous.push(current);
        }

        return previous;
      }, []);

      assert.equal(messages.length, 1);
    });

    it('warns about missing region', function() {
      delete context.config['fastboot-s3'].region;

      var plugin = subject.createDeployPlugin({
        name: 'fastboot-s3'
      });
      plugin.beforeHook(context);
      assert.throws(function(error){
        plugin.configure(context);
      });
      var messages = mockUi.messages.reduce(function(previous, current) {
        if (/- Missing required config: `region`/.test(current)) {
          previous.push(current);
        }

        return previous;
      }, []);

      assert.equal(messages.length, 1);
    });
  });

  describe('resolving s3Client from the pipline', function() {
    it('uses the context value', function() {
      var config = requiredConfig;
      var s3Client = {};
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          "fastboot-s3": config
        },
        commandOptions: { },
        distDir: "tmp/dist-deploy",
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
      var config = requiredConfig;
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          "fastboot-s3": config
        },
        commandOptions: { },
        distDir: "tmp/dist-deploy"
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      assert.typeOf(config.distDir, 'function');
      assert.equal(config.distDir(context), 'tmp/dist-deploy');
    });
  });

  describe('resolving revisionKey from the pipeline', function() {
    it('uses the context value if it exists and commandOptions doesn\'t', function() {
      var config = requiredConfig;
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          "fastboot-s3": config
        },
        commandOptions: { },
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
      var config = requiredConfig;
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
      var config = requiredConfig;
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          "fastboot-s3": config
        },
        commandOptions: { },
        distDir: process.cwd() + '/tests/fixtures/' + DIST_DIR,
        revisionData: {
          revisionKey: 'abcd'
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);

      var archivePath = context.config['fastboot-s3'].archivePath;
      var archiveName = "dist-abcd.tar";

      return assert.isFulfilled(plugin.didPrepare(context))
        .then(function() {
          var fileName = path.join(archivePath, archiveName);

          return stat(fileName).then(function(stats) {
            assert.ok(stats.isFile());
          })
          .then(function() {
            return targz().extract(fileName, archivePath);
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
        region: "region",
        bucket: "bucket"
      };
      context = {
        ui: mockUi,
        project: stubProject,
        config: {
          "fastboot-s3": config
        },
        commandOptions: { },
        distDir: process.cwd() + '/tests/fixtures/' + DIST_DIR,
        revisionData: {
          revisionKey: 'abcd'
        }
      };
    });

    it('resolves if all uploads succeed', function() {
      plugin.beforeHook(context);
      plugin.configure(context);
      plugin.didPrepare(context);

      return assert.isFulfilled(plugin.upload(context))
        .then(function() {
          assert.equal(mockUi.messages.length, 10);

          var messages = mockUi.messages.reduce(function(previous, current) {
            if (/- ✔  (dist-abcd\.tar|fastboot-deploy-info\.json)/.test(current)) {
              previous.push(current);
            }

            return previous;
          }, []);

          assert.equal(messages.length, 2);
        });
    });

    it('prints an error message if the upload errors', function() {
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          "fastboot-s3": requiredConfig
        },
        commandOptions: { },
        distDir: process.cwd() + '/tests/fixtures/' + DIST_DIR,
        revisionData: {
          revisionKey: 'abcd'
        },
        s3Client: {
          putObject: function() {
            return {
              promise: function() {
                return Promise.reject(new Error('something bad went wrong'));
              }
            };
          }
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      plugin.didPrepare(context);

      return assert.isRejected(plugin.upload(context))
        .then(function() {
          assert.match(mockUi.messages[mockUi.messages.length-1], /- Error: something bad went wrong/);
        });
    });

  });
});
