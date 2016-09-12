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
  var subject, mockUi;

  beforeEach(function() {
    subject = require('../../index');
    mockUi = {
      verbose: true,
      messages: [],
      write: function() { },
      writeLine: function(message) {
        this.messages.push(message);
      }
    };
  });

  describe('resolving distDir from the pipeline', function() {
    it('uses the context value', function() {
      var plugin = subject.createDeployPlugin({
        name: 'fastboot-s3'
      });

      var config = {
      };
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
      var plugin = subject.createDeployPlugin({
        name: 'fastboot-s3'
      });

      var config = {
      };
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
      var plugin = subject.createDeployPlugin({
        name: 'fastboot-s3'
      });

      var config = {
      };
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

  describe('didBuild hook', function() {
    it('creates a tarball of the dist folder with revision', function() {
      var plugin = subject.createDeployPlugin({
        name: 'fastboot-s3'
      });

      var config = {
      };
      var context = {
        ui: mockUi,
        project: stubProject,
        config: {
          "fastboot-s3": config
        },
        commandOptions: { },
        distDir: process.cwd() + '/tests/' + DIST_DIR,
        revisionData: {
          revisionKey: 'abcd'
        }
      };

      plugin.beforeHook(context);
      plugin.configure(context);
      plugin.setup(context);

      var archivePath = context.config['fastboot-s3'].archivePath;
      var archiveName = "dist-abcd.tar";

      return assert.isFulfilled(plugin.didBuild(context))
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
});
