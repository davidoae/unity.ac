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
var read = require('read');
var util = require('util');

var RestAPI = require('oae-rest');
var RestContext = require('oae-rest/lib/model').RestContext;

var UnityAPI = require('./api');

var argv = require('yargs')
    .usage('Usage: $0 --file path/to/file.csv')

    .alias('h', 'help')
    .describe('h', 'Show help information')

    .alias('u', 'url')
    .describe('u', 'The URL of the global admin url (including the protocol)')

    .alias('a', 'admin')
    .describe('a', 'The username of the global administrator')

    .alias('f', 'file')
    .describe('f', 'The path to the CSV file')

    .alias('c', 'concurrency')
    .default('c', 1)
    .describe('c', 'The number of threads to run')

    .demand(['u', 'a', 'f'])

    .argv;

read({'prompt': 'Password: ', 'silent': true}, function(err, password) {
    if (err) {
        console.log('Error: %s', err.stack);
        process.exit(1);
    }

    var restCtx = new RestContext(argv.url, {
        'username': argv.admin,
        'userPassword': password,
        'strictSSL': false
    });

    // List the errors
    require('oae-rest/lib/util').on('error', function(err, body, response) {
        console.log('Error %d: - %s', err.code, body);
    });

    console.log('Parsing CSV data...');
    UnityAPI.getAliasListData(argv.file, function(err, records) {
        if (err) {
            process.exit(1);
        }

        console.log('Getting all current tenants...');
        RestAPI.Tenants.getTenants(restCtx, function(err, tenants) {
            if (err) {
                console.log('Failed to get all the tenants');
                process.exit(1);
            }

            console.log('Begin updating Google auth for tenants...');

            var concurrency = parseInt(argv.c, 10);
            if (_.isNaN(concurrency)) {
              console.log('Invalid argument concurrency argument: "%s"', argv.c);
              process.exit(1);
            }

            for (var i = 0; i < concurrency; i++) {
                updateTenants(restCtx, tenants, records, function() {
                    console.log('All done');
                });
            }
        });
    });
});

var updateTenants = function(restCtx, tenants, records, callback) {
    if (_.isEmpty(records)) {
        return callback();
    }

    var record = records.pop();
    console.log('%s', record.alias);

    if (!tenants[record.alias]) {
        // can't do it if tenant does not exist
        console.log('  Ignoring bacause tenant does not exist.');
        // Move on to the next one
        return setImmediate(updateTenants, restCtx, tenants, records, callback);
    }

    // unset gogole auth and set local auth
    revertGoogleAuth(restCtx, tenants[record.alias], function(err, tenant) {
        if (err) {
            console.log('  Failed to update the tenant');
            console.log(err);
            process.exit(1);
        }

        // Move on to the next one
        updateTenants(restCtx, tenants, records, callback);
    });
};

var revertGoogleAuth = function(restCtx, tenant, callback) {
    console.log('  Setting configuration');
    var update = {};

    // unset to turn google auth off
    update['oae-authentication/google/enabled'] = false;

    // and set local auth to on
    update['oae-authentication/local/enabled'] = true;
    update['oae-authentication/local/allowAccountCreation'] = true;

    // run update
    RestAPI.Config.updateConfig(restCtx, tenant.alias, update, callback);
};

