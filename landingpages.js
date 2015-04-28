/*!
 * Copyright 2015 Apereo Foundation (AF) Licensed under the
 * Educational Community License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 *
 *     http://opensource.org/licenses/ECL-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

var _ = require('lodash');
var csv = require('csv');
var fs = require('fs');
var path = require('path');
var RestAPI = require('oae-rest');
var RestContext = require('oae-rest/lib/model').RestContext;
var util = require('util');

var UnityAPI = require('./api');


var argv = require('yargs')
    .usage('Usage: $0 --file path/to/file.csv')

    .alias('h', 'help')
    .describe('h', 'Show help information')

    .alias('u', 'url')
    .describe('u', 'The URL of the global admin url (including the protocol)')

    .alias('a', 'admin')
    .describe('a', 'The username of the global administrator')

    .alias('p', 'password')
    .describe('p', 'The password of the global administrator')


    .alias('f', 'file')
    .describe('f', 'The path to the CSV file')

    .demand(['u', 'a', 'p', 'f'])

    .argv;

var restCtx = new RestContext(argv.url, {
    'username': argv.admin,
    'userPassword': argv.password,
    'strictSSL': false
});

// List the errors
require('oae-rest/lib/util').on('error', function(err, body, response) {
    console.log('Error %d: - %s', err.code, body);
});

// Get the CSV data
console.log(argv.file);
UnityAPI.getCSVData(argv.file, function(err, records) {
    if (err) {
        process.exit(1);
    }

    console.log('Got data');

    // Get all existing tenants
    RestAPI.Tenants.getTenants(restCtx, function(err, existingTenants) {
        if (err) {
            console.log('Failed to get all the tenants');
            process.exit(1);
        }

        processRecords(records, existingTenants, function(err) {
            console.log('All done');
        });
    });
});

var processRecords = function(records, existingTenants, callback) {
    if (_.isEmpty(records)) {
        return callback();
    }

    var record = records.pop();

    // Ignore the `default` alias
    if (!existingTenants[record.alias]) {
        console.log('Skipping %s as there is no such tenant on the system', record.alias);
        return processRecords(records, existingTenants, callback);
    }

    setLandingPage(record, function(err) {
        if (err) {
            console.log('    Failed to set the landing page');
            console.log(err);
            process.exit(1);
        }

        // Move on to the next one
        processRecords(records, existingTenants, callback);
    });
};

var setLandingPage = function(record, callback) {
    console.log('Setting landingpage for: %s', record.alias);

    // Configure the landing page
    var landingPage = getLandingPage(record);
    var update = {};
    _.each(landingPage, function(block, blockId) {
        _.each(block, function(val, name) {
                if (name === 'text' && val && val.default) {
                    update[util.format('oae-tenants/%s/%s/default', blockId, name)] = val.default;
                } else {
                    update[util.format('oae-tenants/%s/%s', blockId, name)] = val;
                }
        });
    });

    // Configure the skin
    update['oae-ui/skin/variables/branding-image-url'] = "'/assets/landingpage/branding.png'";
    update['oae-ui/skin/variables/branding-gradient1-color'] = 'rgba(255, 255, 255, 0.34)';
    update['oae-ui/skin/variables/branding-gradient2-color'] = 'rgba(255, 255, 255, 0.34)';

    RestAPI.Config.updateConfig(restCtx, record.alias, update, callback);
};

var getLandingPage = function(record) {
    var landingPage = require('./landingpage.json');
    landingPage = _.cloneDeep(landingPage);

    landingPage.block_2.text.default = '# \\*Unity for _DEFINITE__DISPLAYNAME_\r\n\r\nThe cloud where universities work together'
        .replace(/_DEFINITE_/g, (record.definite ? record.definite + ' ' : ''))
        .replace(/_DISPLAYNAME_/g, record.organisation);

    landingPage.block_3.videoPlaceholder = '/assets/landingpage/video.png';

    landingPage.block_6.text.default = 'Note that \\*Unity is not an official campus service provided by _DEFINITE__DISPLAYNAME_. Find out more about \\*Unity at [http://www.unity.ac](http://www.unity.ac).\r\n\r\nNot at _DEFINITE__DISPLAYNAME_? [Find your university here](http://www.unity.ac).'
        .replace(/_DEFINITE_/g, (record.definite ? record.definite + ' ' : ''))
        .replace(/_DISPLAYNAME_/g, record.organisation);

    return landingPage;
};
