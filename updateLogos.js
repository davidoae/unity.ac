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

    .alias('l', 'logos')
    .default('l', './logos')
    .describe('l', 'The path to the logos directory')

    .demand(['u', 'a', 'p', 'l'])

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

// Read the logos dir
if (!fs.existsSync(argv.logos)) {
    console.log('Logos directory does not exist');
    process.exit(1);
}

fs.readdir(argv.logos, function(err, tenantAliases) {
    if (err) {
        console.log('Failed to read logos directory');
        process.exit(1);
    }

    // Get all existing tenants
    RestAPI.Tenants.getTenants(restCtx, function(err, existingTenants) {
        if (err) {
            console.log('Failed to get all the tenants');
            process.exit(1);
        }

        processTenants(tenantAliases, existingTenants, function(err) {
            console.log('All done');
        });
    });
});

var processTenants = function(tenantAliases, existingTenants, callback) {
    if (_.isEmpty(tenantAliases)) {
        return callback();
    }

    var tenantAlias = tenantAliases.pop();

    // Ignore the `default` alias
    if (tenantAlias === 'default') {
        return processTenants(tenantAliases, existingTenants, callback);
    } else if (!existingTenants[tenantAlias]) {
        console.log('Skipping %s as there is no such tenant on the system', tenantAlias);
        return processTenants(tenantAliases, existingTenants, callback);
    }

    setLogos(tenantAlias, function(err) {
        if (err) {
            console.log('  Failed to set the logos');
            console.log(err);
            process.exit(1);
        }

        // Move on to the next one
        processTenants(tenantAliases, existingTenants, callback);
    });
};

var setLogos = function(tenantAlias, callback) {
    console.log('Setting logos for: %s', tenantAlias);

    // The logo files exist on disk at ./logos/<tenant alias>/file.png
    var hasSmallLogo = fs.existsSync(path.join(argv.logos, tenantAlias, 'small.png'));
    var hasLargeLogo = fs.existsSync(path.join(argv.logos, tenantAlias, 'large.png'));
    var hasBranding = fs.existsSync(path.join(argv.logos, tenantAlias, 'branding.png'));

    // The logo files can reached on the web on `/assets/<tenant alias>/file.png`. Keep in mind that
    // the image URLs need to be encapsulated in single quotes
    var update = {};
    if (hasLargeLogo) {
        update['oae-ui/skin/variables/institutional-logo-url'] = util.format("'/assets/%s/large.png'", tenantAlias);
    } else {
        update['oae-ui/skin/variables/institutional-logo-url'] = util.format("'/assets/%s/large.png'", 'default');
    }
    if (hasSmallLogo) {
        update['oae-ui/skin/variables/institutional-logo-small-url'] = util.format("'/assets/%s/small.png'", tenantAlias);
    } else {
        update['oae-ui/skin/variables/institutional-logo-small-url'] = util.format("'/assets/%s/small.png'", 'default');
    }

    // Only set the branding image if there is one.
    if (hasBranding) {
        update['oae-ui/skin/variables/branding-image-url'] = util.format("'/assets/%s/branding.png'", tenantAlias);
    }
    RestAPI.Config.updateConfig(restCtx, tenantAlias, update, callback);
};
