# ember-cli-deploy-fastboot-s3

> An ember-cli-deploy plugin that archives and uploads FastBoot build to AWS S3 based on [FastBoot AWS][1].

[![Build Status](https://travis-ci.org/he9qi/ember-cli-deploy-fastboot-s3.svg?branch=master)](https://travis-ci.org/he9qi/ember-cli-deploy-fastboot-s3)
[![npm version](https://badge.fury.io/js/ember-cli-deploy-fastboot-s3.svg)](https://badge.fury.io/js/ember-cli-deploy-fastboot-s3)
[![](https://camo.githubusercontent.com/d65a04992412d3a15584f0d302a69df2749176c7/68747470733a2f2f656d6265722d636c692d6465706c6f792e6769746875622e696f2f656d6265722d636c692d6465706c6f792d76657273696f6e2d6261646765732f706c7567696e732f656d6265722d636c692d6465706c6f792d73332e737667)](http://ember-cli-deploy.github.io/ember-cli-deploy-version-badges/)

This plugin is based on [FastBoot AWS][1], but it only manages FastBoot builds for S3, and does only three things:

1. archives the FastBoot build(from [ember-cli-deploy-build][2]) using revision information(from [ember-cli-deploy-revision-data][3]).
2. creates a file that contains FastBoot deploy info using the archived build as so:
```
{
  "bucket": "S3_BUCKET",
  "key": "NAME_OF_ZIP_FILE"
}
```
3. uploads archived build and the FastBoot deploy info file to S3.

This plugin works along with [ember-fastboot-app-server][7]. The same `bucket` and `key` in FastBoot deploy info are required for both to work together.

## What is an ember-cli-deploy plugin?

A plugin is an addon that can be executed as a part of the ember-cli-deploy pipeline. A plugin will implement one or more of the ember-cli-deploy's pipeline hooks.

For more information on what plugins are and how they work, please refer to the [Plugin Documentation][4].

## Quick Start
To get up and running quickly, do the following:

- Ensure both [ember-cli-deploy-build][2] and [ember-cli-deploy-revision-data][3] are installed and configured.

- Install this plugin

```bash
$ ember install ember-cli-deploy-fastboot-s3
```

- Place the following configuration into `config/deploy.js`

```javascript
ENV['fastboot-s3'] = {
  accessKeyId: '<your-aws-access-key>',
  secretAccessKey: '<your-aws-secret>',
  bucket: '<your-s3-bucket>',
  region: '<the-region-your-bucket-is-in>'
}
```

- Run the pipeline

```bash
$ ember deploy
```

## Installation
Run the following command in your terminal:

```bash
ember install ember-cli-deploy-fastboot-s3
```

## ember-cli-deploy Hooks Implemented

For detailed information on what plugin hooks are and how they work, please refer to the [Plugin Documentation][4].

- `didPrepare`
- `upload`

## Configuration Options

For detailed information on how configuration of plugins works, please refer to the [Plugin Documentation][4].

### accessKeyId

The AWS access key for the user that has the ability to upload to the `bucket`. If this is left undefined,
the normal [AWS SDK credential resolution][5] will take place.

*Default:* `undefined`

### secretAccessKey

The AWS secret for the user that has the ability to upload to the `bucket`. This must be defined when `accessKeyId` is defined.

*Default:* `undefined`

### bucket (`required`)

The AWS bucket that the files will be uploaded to.

*Default:* `undefined`

### region (`required`)

The region the AWS `bucket` is located in.

*Default:* `undefined`

### archivePath

The archive directory for which the archived files are stored.

*Default:* `'tmp/deploy-archive'`

### archiveType

The archive type (zip|tar).

*Default:* `'zip'`

### deployInfo

The deploy info file.

*Default:* `'fastboot-deploy-info.json'`

### distDir

The root directory where the file matching `filePattern` will be searched for. By default, this option will use the `distDir` property of the deployment context.

*Default:* `context.distDir`

### revisionKey

The unique revision number for the version of the file being archived and uploaded to S3. By default this option will use either the `revisionKey` passed in from the command line or the `revisionData.revisionKey` property from the deployment context.

*Default:* `context.commandLineArgs.revisionKey || context.revisionData.revisionKey`

## Prerequisites

The following properties are expected to be present on the deployment `context` object:

- `distDir`      (provided by [ember-cli-deploy-build][2])
- `revisionKey` (provided by [ember-cli-deploy-revision-data][3])

## Configuring Amazon S3

### Minimum S3 Permissions

Ensure you have the minimum required permissions configured for the user (accessKeyId). A bare minimum policy should have the following permissions:

```
{
    "Statement": [
        {
            "Sid": "Stmt1EmberCLIS3DeployPolicy",
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:PutObjectACL"
            ],
            "Resource": [
                "arn:aws:s3:::<your-s3-bucket-name>/*"
            ],
            "Principal": { "AWS": "arn:aws:iam::AWS-account-ID:root" }
        }
    ]
}

```
Replace <your-s3-bucket-name> with the name of the actual bucket you are deploying to. Also, remember that "PutObject" permission will effectively overwrite any existing files with the same name unless you use a fingerprinting or a manifest plugin.

### Sample CORS configuration

To properly serve certain assets (i.e. webfonts) a basic CORS configuration is needed

```
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <CORSRule>
    <AllowedOrigin>http://www.your-site.com</AllowedOrigin>
    <AllowedOrigin>https://www.your-site.com</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
  </CORSRule>
</CORSConfiguration>
```

Replace **http://www.your-site.com** with your domain.

Some more info: [Amazon CORS guide][5], [Stackoverflow][6]

## Running Tests

* `node tests/runner.js`

For more information on using ember-cli, visit [http://ember-cli.com/](http://ember-cli.com/).

## Contributing
PRs welcome!


[1]: https://github.com/tomdale/fastboot-aws
[2]: https://github.com/ember-cli-deploy/ember-cli-deploy-build
[3]: https://github.com/ember-cli-deploy/ember-cli-deploy-revision-data
[4]: http://ember-cli.github.io/ember-cli-deploy/plugins "Plugin Documentation"
[5]: http://docs.aws.amazon.com/AmazonS3/latest/dev/cors.html "Amazon CORS guide"
[6]: http://stackoverflow.com/questions/12229844/amazon-s3-cors-cross-origin-resource-sharing-and-firefox-cross-domain-font-loa?answertab=votes#tab-top "Stackoverflow"
[7]: https://github.com/he9qi/ember-fastboot-app-server
