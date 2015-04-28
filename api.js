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
var util = require('util');


var getCSVData = module.exports.getCSVData = function(csvPath, callback) {
    // Parse the CSV file
    var options = {
        'columns': ['idp', 'organisation', 'alias', 'hostname', 'country', 'timezone', 'language', 'email', 'termsAndConditions', 'definite']
    };
    var parser = csv.parse(options, function(err, records) {
        if (err) {
            console.log('Failed to read CSV file');
            console.log(err);
            return callback(err);
        }

        // Shift out the headers
        // records.shift();

        return callback(null, records);
    });

    // Pipe the CSV file to the parser
    var fileStream = fs.createReadStream(csvPath, {'encoding': 'utf8'});
    fileStream.pipe(parser);
};
