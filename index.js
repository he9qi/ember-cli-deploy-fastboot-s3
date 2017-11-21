/* eslint-env node */
'use strict';

const BasePlugin = require('ember-cli-deploy-plugin');
const RSVP = require('rsvp');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const AWS = require('aws-sdk');

const DEFAULT_DEPLOY_INFO = 'fastboot-deploy-info.json';
const DEFAULT_DEPLOY_ARCHIVE = 'dist';

module.exports = {
  name: 'ember-cli-deploy-fastboot-s3',

  createDeployPlugin(options) {
    const name = options.name;
    const DeployPlugin = BasePlugin.extend({
      name,
      defaultConfig: {
        archivePath: path.join('tmp', DEFAULT_DEPLOY_ARCHIVE),
        archiveType: 'zip',
        deployInfo: DEFAULT_DEPLOY_INFO,
        deployArchive: DEFAULT_DEPLOY_ARCHIVE,
        distDir: (context) => context.distDir,
        revisionKey: (context) => (
          context.commandOptions.revision ||
          (context.revisionData && context.revisionData.revisionKey)
        ),
        s3Client: (context) => context.s3Client,
      },

      requiredConfig: ['bucket'],

      configure(/*context*/) {
        // Ensure default config is applied
        this._super.configure.apply(this, arguments);

        // If a custom S3 client is configured then the rest of the
        // configuration is redundant.
        if (this.readConfig('s3Client')) {
          return;
        }

        // An endpoints makes the region config redundant, however
        // at least one of them must be present.
        if (!this.readConfig('region') && !this.readConfig('endpoint')) {
          const message = `You must configure either an 'endpoint' or a 'region' to use the AWS.S3 client.`;

          this.log(message, { color: 'red' });
          throw new Error(message);
        }
      },

      setup(/*context*/) {
        this.s3 =
          this.readConfig('s3Client') ||
          new AWS.S3({
            region: this.readConfig('region'),
            accessKeyId: this.readConfig('accessKeyId'),
            secretAccessKey: this.readConfig('secretAccessKey'),
            endpoint: this.readConfig('endpoint')
          });
      },

      didPrepare(/*context*/) {
        return this._pack()
          .then(() => {
            const archiveName = this._buildArchiveName();
            this.log(`✔  ${archiveName}`, { verbose: true });
          });
      },

      upload(/*context*/) {
        const prefix = this.readConfig('prefix');
        const archiveName = this._buildArchiveName();
        this.key = prefix ? [prefix, archiveName].join('/') : archiveName;

        return this._upload(this.s3)
          .then(() => {
            this.log(`✔  ${this.key}`, { verbose: true });
            return RSVP.Promise.resolve();
          })
          .catch(this._errorMessage.bind(this));
      },

      activate(/* context */) {
        const revisionKey = this.readConfig('revisionKey');

        this.log(`preparing to activate ${revisionKey}`, {
          verbose: true
        });

        return this._uploadDeployInfo(this.s3)
          .then(() => {
            this.log(`✔  activated revison ${revisionKey}`, {
              verbose: true
            });
          })
          .catch(this._errorMessage.bind(this));
      },

      _upload(s3) {
        const archivePath = this.readConfig('archivePath');
        const archiveName = this._buildArchiveName();
        const prefix = this.readConfig('prefix');
        const key = prefix ? [prefix, archiveName].join('/') : archiveName;
        const fileName = path.join(archivePath, archiveName);
        const file = fs.createReadStream(fileName);
        const bucket = this.readConfig('bucket');
        const params = {
          Bucket: bucket,
          Key: key,
          Body: file
        };

        this.log(`preparing to upload to S3 bucket '${bucket}'`, {
          verbose: true
        });

        return s3.putObject(params).promise();
      },

      _uploadDeployInfo(s3 /*, key*/) {
        const deployInfo = this.readConfig('deployInfo');
        const bucket = this.readConfig('bucket');
        const prefix = this.readConfig('prefix');
        const body = this._createDeployInfo();
        const key = prefix ? [prefix, deployInfo].join('/') : deployInfo;
        const params = {
          Bucket: bucket,
          Key: key,
          Body: body
        };

        return s3.putObject(params).promise();
      },

      _createDeployInfo() {
        const bucket = this.readConfig('bucket');
        const prefix = this.readConfig('prefix');
        const archiveName = this._buildArchiveName();
        const key = prefix ? [prefix, archiveName].join('/') : archiveName;

        return `{"bucket":"${bucket}","key":"${key}"}`;
      },

      _pack() {
        return new RSVP.Promise((resolve, reject) => {
          const distDir = this.readConfig('distDir');
          const archivePath = this.readConfig('archivePath');
          const archiveType = this.readConfig('archiveType');
          const deployArchive = this.readConfig('deployArchive');

          fs.mkdirsSync(archivePath);

          const archiveName = this._buildArchiveName();
          const fileName = path.join(archivePath, archiveName);

          this.log(`saving deploy archive to ${fileName}`, {
            verbose: true
          });

          const output = fs.createWriteStream(fileName);
          const archive = archiver(archiveType, { zlib: { level: 9 } });

          archive.pipe(output);
          archive.directory(distDir, deployArchive).finalize();

          output.on('close', resolve);
          archive.on('error', (err) => reject(err));
        });
      },

      _buildArchiveName() {
        const deployArchive = this.readConfig('deployArchive');
        const revisionKey = this.readConfig('revisionKey');
        const archiveType = this.readConfig('archiveType');
        return `${deployArchive}-${revisionKey}.${archiveType}`;
      },

      _errorMessage(error) {
        this.log(error, { color: 'red' });
        if (error) {
          this.log(error.stack, { color: 'red' });
        }
        return RSVP.Promise.reject(error);
      }
    });

    return new DeployPlugin();
  }
};
