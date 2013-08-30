var crawl = require('./crawl.js');

// Pass in a second argument site_map_only to hide messy static resource output.

var domain = process.argv.slice(2)[0];
var output_type = process.argv.slice(2)[1];

crawl.go(domain, function (results) {
	save_results_as_json(results, domain);
});


function print_results(results) {
	console.log("Total of " + results.pages_scanned.length + " pages scanned:");
	for(var u in results.pages_scanned) {
		var item = results.pages_scanned[u];
		console.log(item.url);
		if(output_type != 'site_map_only') {
			for(var s in item.static_resources) {
				console.log('\t\t' + item.static_resources[s]);
			}
		}
	}
	console.log("Total of " + results.pages_scanned.length +
		" pages scanned in " + results.time_taken + "s");
}

function save_results_as_json(results, filename) {
	filename = filename + ".json";
	var fs = require('fs');
	fs.writeFile(filename, JSON.stringify(results), function(err) {
		if(err) {
			console.log(err);
		} else {
			console.log("Results saved as " + filename);
		}
	});	
}