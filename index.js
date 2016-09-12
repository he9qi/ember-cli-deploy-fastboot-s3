/* jshint node: true */
'use strict';

var BasePlugin = require('ember-cli-deploy-plugin');
var Promise    = require('ember-cli/lib/ext/promise');
var fs         = require('fs-extra');
var fsp        = require('fs-promise');
var path       = require('path');
var move       = Promise.denodeify(fs.move);
var targz      = require('tar.gz');

var AWS = require('aws-sdk');

var DEFAULT_DEPLOY_INFO = "fastboot-deploy-info.json";
var DEFAULT_DEPLOY_ARCHIVE = "deploy-archive";

module.exports = {
  name: 'ember-cli-deploy-fastboot-s3',

  createDeployPlugin: function(options) {
    var DeployPlugin = BasePlugin.extend({
      name: options.name,

      defaultConfig: {
        archivePath: path.join('tmp', DEFAULT_DEPLOY_ARCHIVE),
        deployInfo: DEFAULT_DEPLOY_INFO,
        distDir: function(context) {
          return context.distDir;
        },
        revisionKey: function(context) {
          return context.commandOptions.revision || (context.revisionData && context.revisionData.revisionKey);
        },
        s3Client: function(context) {
          return context.s3Client;
        }
      },
      requiredConfig: ['bucket', 'region'],

      willUpload: function(context) {
        return this._pack()
          .then(this._createDeployInfo());
      },

      upload: function(context) {
        var self = this;
        this.key = this._buildArchiveName();
        this.s3 = this.readConfig('s3Client') || new AWS.S3({
            region: this.readConfig('region'),
            accessKeyId: this.readConfig('accessKeyId'),
            secretAccessKey: this.readConfig('secretAccessKey')
          });

        return this._upload(self.s3)
          .then(function() {
            self.log('✔  ' + self.key, { verbose: true });
            return Promise.resolve();
          })
          .then(function() {
            return self._uploadDeployInfo(self.s3);
          })
          .then(function() {
            self.log('✔  ' + self.key, { verbose: true });
          })
          .catch(this._errorMessage.bind(this));
      },

      _upload: function(s3) {
        var archivePath = this.readConfig('archivePath');
        var archiveName = this._buildArchiveName();
        var fileName = path.join(archivePath, archiveName);

        var file = fs.createReadStream(fileName);
        var bucket = this.readConfig('bucket');
        var params = {
          Bucket: bucket,
          Key: archiveName,
          Body: file
        };

        this.log('preparing to upload to S3 bucket `' + bucket + '`', { verbose: true });

        return s3.putObject(params).promise();
      },

      _uploadDeployInfo: function(s3, key) {
        var archivePath = this.readConfig('archivePath');
        var deployInfo = this.readConfig('deployInfo');
        var bucket = this.readConfig('bucket');
        var fileName = path.join(archivePath, deployInfo);

        var params = {
          Bucket: bucket,
          Key: deployInfo,
          Body: fs.createReadStream(fileName)
        };

        return s3.putObject(params).promise();
      },

      _createDeployInfo() {
        var fileName = path.join(this.readConfig('archivePath'), this.readConfig('deployInfo'));
        var bucket = this.readConfig('bucket');
        var key = this._buildArchiveName();

        return fsp.writeFile(fileName, `{"bucket":"${bucket}","key":"${key}"}`);
      },

      _pack: function() {
        var distDir = this.readConfig('distDir');
        var archivePath = this.readConfig('archivePath');

        fs.mkdirsSync(archivePath);

        var archiveName = this._buildArchiveName();
        var fileName = path.join(archivePath, archiveName);

        this.log('saving tarball of ' + distDir + ' to ' + fileName);

        return targz().compress(distDir, fileName);
      },

      _buildArchiveName: function() {
        var distDirName = this.readConfig('distDir').split('/').slice(-1);
        var revisionKey = this.readConfig('revisionKey');
        return `${distDirName}-${revisionKey}.tar`;
      },

      _errorMessage: function(error) {
        this.log(error, { color: 'red' });
        if (error) {
          this.log(error.stack, { color: 'red' });
        }
        return Promise.reject(error);
      }
    });

    return new DeployPlugin();
  }
};
