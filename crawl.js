
var async = require('async');
var phantom = require('phantom');
var url = require('url');
var portscanner = require('portscanner');

phantom.onError = function (msg, trace) {
	console.log(msg);
	trace.forEach(function(item) {
		console.log('  ', item.file, ':', item.line);
	});
};

var concurrency = 20;

var page_scans_in_progress = 0;

var port_number = 9999;

var begin_page_scan = function (page_url) {
	++page_scans_in_progress;
	portscanner.findAPortNotInUse(9000, 9999, 'localhost', function(error, port) {
		console.log('Using port: ' + port_number);
		phantom.create('--load-images=no',{'port': port_number++}, function(ph) {
			ph.createPage(function(page) {
				page.open(page_url, function(status){
					if(status == 'success') {
						console.log("Successfuly opened " + page_url);
					} else {
						console.log("Failed to open " + page_url + "(" + status + ")");
					}
					page.evaluate(function () {
						var nodeList = document.getElementsByTagName('a');
						var urls = [];
						for(var i = 0; i < nodeList.length; ++i) {
							urls.push(nodeList[i].getAttribute('href'));
						}
						return urls;
					}, function (urls) {
						// We've been sent back the urls, normalise
						// them an put them on the list...
						for(var i in urls) {
							var normalised_url = normalise_url(page_url, urls[i]);
							url_bank.add(normalised_url);
						}
						ph.exit();
						--page_scans_in_progress;
					});
				});
			});
		});
	});
};

String.prototype.startsWith = function (other) {
	return this.substr(0, other.length) == other;
};

// This cheats and sends back "/" in the case of an off-site URL
var normalise_url = function (page_url, href) {
	var resolved = url.resolve(page_url, href);
	var http_start = 'http://' + root_domain;
	var https_start = 'https://' + root_domain;
	if(resolved.startsWith(http_start)) {
		resolved = resolved.substr(http_start.length);
	}
	if(resolved.startsWith(https_start)) {
		resolved = resolved.substr(https_start.length);
	}
	if(resolved.startsWith("http://") || resolved.startsWith("https://")) {
		// This must be offsite
		return "/";
	}

	var hashIndex = resolved.indexOf('#');
	if(hashIndex != -1) {
		resolved = resolved.substring(0, hashIndex);
	}

	return resolved;
};

var url_bank = (function () {

	stored_urls = {};

	return {
		add: function(page_url) {
			if(stored_urls.hasOwnProperty(page_url)) {
				return;
			}
			stored_urls[page_url] = page_url;
			enqueue_page_scan(page_url);
		},
		all: function() {
			return stored_urls;
		},
		count: function() {
			var count = 0;
			for(var i in stored_urls) {
				if(stored_urls.hasOwnProperty(i)) {
					++count;
				}
			}
			return count;
		}
	};

}());

var queue = [];
var consume_queue_timeout = 0;

var enqueue_page_scan = function (page_url) {
	console.log("Adding " + page_url + " to queue["+ queue.length +"]...")
	queue.push(page_url);
	wait();
};

var wait = function () {
	clearTimeout(consume_queue_timeout);
	consume_queue_timeout = setTimeout(consume_queue, 10);
};

var consume_queue = function () {
	//console.log("Checking queue; page_scans_in_progress=" +
	//	page_scans_in_progress + "; queue.length=" + queue.length);
	if(page_scans_in_progress >= concurrency) {
		wait();
	} else if(queue.length > 0) {
		var full_url = url.resolve("http://"+root_domain+"/", queue.pop());
		console.log('=== Beginning scan of ' + full_url);
		try {
			begin_page_scan(full_url);
		} catch(error) {
			console.log("===ERROR (consume_queue)=== " + error);
		}
		wait();
	} else if(page_scans_in_progress > 0) {
		wait();
	} else {
		// Nothing left to do, print results...
		console.log("Total of " + url_bank.count() + " URLs found");
		for(var u in url_bank.all()) {
			console.log(u);
		}
		console.log("Total of " + url_bank.count() + " URLs found");
	}
};

var root_domain = process.argv.slice(2)[0];

enqueue_page_scan("http://" + root_domain);