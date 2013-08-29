var crawl = require('./crawl.js');

var domain = process.argv.slice(2);

crawl.go(domain, print_results);

function print_results(results) {
	console.log("Total of " + results.pages_scanned.length + " pages scanned:");
	for(var u in results.pages_scanned) {
		console.log(results.pages_scanned[u].url);
	}
	console.log("Total of " + results.pages_scanned.length +
		" pages scanned in " + results.time_taken + "s");
}