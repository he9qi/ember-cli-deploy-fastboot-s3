# FastBoot Server for S3

ember-cli-deploy-build
ember-cli-deploy-s3

It is based on the FastBoot App Server, configured to use the S3 downloader and S3 notifier.

FastBoot allows Ember apps to be rendered on the server, to support things like search crawlers and clients without JavaScript. For more information about FastBoot, see ember-cli-fastboot.

This server is designed to run either on Elastic Beanstalk or on your own EC2 servers. It also works just fine for non-AWS hosting environments, such as Heroku or Digital Ocean, if you want to use S3 for deploying and storing your built application assets.

WIP

## Installation

* `git clone` this repository
* `npm install`
* `bower install`

## Running

* `ember serve`
* Visit your app at http://localhost:4200.

## Running Tests

* `npm test` (Runs `ember try:testall` to test your addon against multiple Ember versions)
* `ember test`
* `ember test --server`

## Building

* `ember build`

For more information on using ember-cli, visit [http://ember-cli.com/](http://ember-cli.com/).
