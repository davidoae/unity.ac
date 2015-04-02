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
var RestAPI = require('oae-rest');
var RestContext = require('oae-rest/lib/model').RestContext;
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

// Bind a
require('oae-rest/lib/util').on('error', function(err, body, response) {
    console.log('Error %d: - %s', err.code, body);
});

// Parse the CSV file
var options = {
    'columns': ['id', 'idp', 'organisation', 'alias', 'alias with country code', 'tenant host name', 'country', 'timezone', 'language', 'email', 'term and cons', 'logo', 'landing page']
};
var parser = csv.parse(options, function(err, records) {
    // Shift out the headers
    records.shift();

    createTenants(records, function() {
        console.log('All done');
        process.exit(0);
    });
});

// Pipe the CSV file to the parser
var fileStream = fs.createReadStream(argv.file);
fileStream.pipe(parser);

var createTenants = function(records, callback) {
    if (_.isEmpty(records)) {
        return callback();
    }

    var record = records.pop();
    createTenant(record, function(err) {
        if (err) {
            console.log(err);
            process.exit(1);
        }

        createTenants(records, callback);
    });
};

var createTenant = function(record, callback) {
    console.log('  Creating %s', record['tenant host name']);
    // Create the tenant
    RestAPI.Tenants.createTenant(restCtx, record['alias with country code'], record['organisation'], record['tenant host name'], function(err, tenant) {
        if (err) {
            return callback(err);
        }

        // Set some configuration
        var update = {
            'oae-authentication/local/allowAccountCreation': false,
            'oae-authentication/shibboleth/enabled': true,
            'oae-authentication/shibboleth/idpEntityID': record['idp'],
            'oae-principals/user/defaultLanguage': record['language'],
            'oae-tenants/timezone/timezone': record['timezone']
        };
        RestAPI.Config.updateConfig(restCtx, tenant.alias, update, callback);
    });
};
