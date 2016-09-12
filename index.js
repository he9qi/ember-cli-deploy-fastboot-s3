/* jshint node: true */
/* jshint jasmine: true */
'use strict';

var BasePlugin = require('ember-cli-deploy-plugin');
var Promise    = require('ember-cli/lib/ext/promise');
var fs         = require('fs-extra');
var path       = require('path');
var move       = Promise.denodeify(fs.move);
var targz      = require('tar.gz');

module.exports = {
  name: 'ember-cli-deploy-fastboot-s3',

  createDeployPlugin: function(options) {
    var DeployPlugin = BasePlugin.extend({
      name: options.name,

      defaultConfig: {
        archivePath: path.join('tmp', 'deploy-archive'),
        packedDirName: false,
        distDir: function(context) {
          return context.distDir;
        },
        revisionKey: function(context) {
          return context.commandOptions.revision || (context.revisionData && context.revisionData.revisionKey);
        }
      },

      setup: function(/* context */) {
        this.log('setting `archivePath` in deployment context', { verbose: true });

        return {
          archivePath: this.readConfig('archivePath')
        };
      },

      didBuild: function(context) {
        var distDir = this.readConfig('distDir');
        var archivePath = this.readConfig('archivePath');

        fs.mkdirsSync(archivePath);

        return this._pack(distDir);
      },

      upload: function(context) {
        //do something here to actually deploy your app somewhere
      },

      _pack: function(distDir) {
        var archivePath = this.readConfig('archivePath');
        var archiveName = this._buildArchiveName();

        var fileName = path.join(archivePath, archiveName);

        this.log('saving tarball of ' + distDir + ' to ' + fileName);

        return targz().compress(distDir, fileName);
      },

      _buildArchiveName: function() {
        var distDirName = this.readConfig('distDir').split('/').slice(-1);
        var revisionKey = this.readConfig('revisionKey');
        return `${distDirName}-${revisionKey}.tar`;
      }
    });

    return new DeployPlugin();
  }
};
