var crawler = require('./crawler.js');
var log = require('./log.js');

// Pass in a second argument site_map_only to hide messy static resource output.

var domain = process.argv.slice(2)[0];
var output_type = process.argv.slice(2)[1];

crawler.go(domain, function (results) {
	save_results_as_json(results, domain);
}, log);

function save_results_as_json(results, filename) {
	filename = filename + ".json";
	var fs = require('fs');
	fs.writeFile(filename, JSON.stringify(results), function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("\nDone in " + results.time_taken + "s");
			console.log("Results saved as " + filename);
		}
	});	
}