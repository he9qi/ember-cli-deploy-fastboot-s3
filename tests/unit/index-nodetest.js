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
      putObject: function(params) {
        return {
          promise: function() {
            return Promise.resolve();
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

  describe('willUpload hook', function() {
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

      return assert.isFulfilled(plugin.willUpload(context))
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
    it('resolves if all uploads succeed', function() {
      var config = {
        s3Client: s3Client,
        region: "region",
        bucket: "bucket"
      };
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
      plugin.willUpload(context);
      const promises = plugin.upload(context);

      return assert.isFulfilled(promises)
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
  });
});
