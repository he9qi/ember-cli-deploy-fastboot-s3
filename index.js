/* jshint node: true */
/* jshint jasmine: true */
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
        var distDir = this.readConfig('distDir');
        var archivePath = this.readConfig('archivePath');

        fs.mkdirsSync(archivePath);

        return this._pack(distDir);
      },

      upload: function(context) {
        var self = this;
        self.key = this._buildArchiveName();
        self.s3 = this.readConfig('s3Client') || new AWS.S3({
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
            return self._updateDeployInfo(self.s3, self.key);
          });
      },

      _upload: function(s3) {
        var archivePath = this.readConfig('archivePath');
        var archiveName = this._buildArchiveName();
        var fileName = path.join(archivePath, archiveName);

        let file = fs.createReadStream(fileName);
        let bucket = this.readConfig('bucket');
        let params = {
          Bucket: bucket,
          Key: archiveName,
          Body: file
        };

        this.log('preparing to upload to S3 bucket `' + bucket + '`', { verbose: true });

        return s3.putObject(params).promise();
      },

      _updateDeployInfo: function(s3, key) {
        var self = this;
        var archivePath = this.readConfig('archivePath');
        this.bucket = this.readConfig('bucket');
        this.deployInfo = this.readConfig('deployInfo');
        this.fileName = path.join(archivePath, this.deployInfo);

        return fsp.writeFile(this.fileName, `{"bucket":"${self.bucket}","key":"${key}"}`).then(function() {
          let params = {
            Bucket: self.bucket,
            Key: self.deployInfo,
            Body: fs.createReadStream(self.fileName)
          };

          self.log('✔  ' + self.deployInfo, { verbose: true });

          return s3.putObject(params).promise();
        });
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
