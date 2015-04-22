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

// Parse the CSV file
var options = {
    'columns': ['idp', 'organisation', 'alias', 'hostname', 'country', 'timezone', 'language', 'email', 'termsAndConditions']
};
var parser = csv.parse(options, function(err, records) {
    // Shift out the headers
    records.shift();

    // Get all existing tenants
    RestAPI.Tenants.getTenants(restCtx, function(err, tenants) {
        if (err) {
            console.log('Failed to get all the tenants');
            process.exit(1);
        }

        // Start creating or updating tenants
        createOrUpdateTenants(tenants, records, function() {
            console.log('All done');
            process.exit(0);
        });
    });
});

// Pipe the CSV file to the parser
var fileStream = fs.createReadStream(argv.file);
fileStream.pipe(parser);

var createOrUpdateTenants = function(tenants, records, callback) {
    if (_.isEmpty(records)) {
        return callback();
    }

    var record = records.pop();
    console.log('%s - %s', record.hostname, record.organisation);

    var createOrUpdateFunction = createTenant;

    // Check if this tenant already exists:
    if (tenants[record.alias]) {
        createOrUpdateFunction = updateTenant;
    }

    // 1. Create or update the tenant
    createOrUpdateFunction(tenants[record.alias], record, function(err, tenant) {
        if (err) {
            console.log('  Failed to create or update the tenant');
            console.log(err);
            process.exit(1);
        }

        // 2. Set the tenants configuration
        setConfiguration(tenant, record, function(err) {
            if (err) {
                console.log('  Failed to set the configuration');
                console.log(err);
                process.exit(1);
            }

            // 3. Set the logos
            setLogos(tenant, record, function(err) {
                if (err) {
                    console.log('  Failed to set the logos');
                    console.log(err);
                    process.exit(1);
                }

                // Move on to the next one
                createOrUpdateTenants(tenants, records, callback);
            });
        });
    });
};

var createTenant = function(tenant, record, callback) {
    console.log('  Creating new tenancy');
    // Create the tenant
    RestAPI.Tenants.createTenant(restCtx, record.alias, record.organisation, record.hostname, callback);
};

var updateTenant = function(tenant, record, callback) {
    console.log('  Updating tenancy');
    var update = {'displayName': record.organisation};

    // Only update the hostname if there's a change as otherwise we'll get a 400 "hostname already exists"
    if (record.hostname !== tenant.host) {
        update.host = record.hostname;
    }
    RestAPI.Tenants.updateTenant(restCtx, tenant.alias, update, function(err) {
        if (err) {
            return callback(err);
        }

        tenant = _.extend(tenant, update);
        return callback(null, tenant);
    });
};

var setConfiguration = function(tenant, record, callback) {
    console.log('  Setting configuration');
    var update = {
        'oae-authentication/local/allowAccountCreation': false,
        'oae-authentication/shibboleth/enabled': true,
        'oae-authentication/shibboleth/idpEntityID': record.idp,
        'oae-principals/termsAndConditions/text/default': record.termsAndConditions,
        'oae-principals/user/defaultLanguage': record.language,
        'oae-tenants/domains/email': record.email,
        'oae-tenants/timezone/timezone': record.timezone
    };
    RestAPI.Config.updateConfig(restCtx, tenant.alias, update, callback);
};

var setLogos = function(tenant, record, callback) {
    // The logo files exist on disk at ./logos/<tenant alias>/file.png
    var directory = path.dirname(path.resolve('./newIdps.csv'));
    var hasSmallLogo = fs.existsSync(path.join(directory, util.format('./logos/%s/small.png', tenant.alias)));
    var hasLargeLogo = fs.existsSync(path.join(directory, util.format('./logos/%s/large.png', tenant.alias)));
    var hasBranding = fs.existsSync(path.join(directory, util.format('./logos/%s/branding.png', tenant.alias)));

    // The logo files can reached on the web on `/assets/<tenant alias>/file.png`. Keep in mind that
    // the image URLs need to be encapsulated in single quotes
    var update = {};
    if (hasSmallLogo) {
        update['oae-ui/skin/variables/institutional-logo-url'] = util.format("'/assets/%s/small.png'", tenant.alias);
    }
    if (hasLargeLogo) {
        update['oae-ui/skin/variables/institutional-logo-small-url'] = util.format("'/assets/%s/large.png'", tenant.alias);
    }
    if (hasBranding) {
        update['oae-ui/skin/variables/branding-image-url'] = util.format("'/assets/%s/branding.png'", tenant.alias);
    }
    if (hasSmallLogo || hasLargeLogo || hasBranding) {
        console.log('  Setting logos');
        RestAPI.Config.updateConfig(restCtx, tenant.alias, update, callback);
    } else {
        console.log('  No logos found');
        return callback();
    }
};
