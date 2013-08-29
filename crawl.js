
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

var root_domain = "samsalisbury.net",
    concurrency = 1;

var page_scans_in_progress = 0;

var begin_page_scan = function (page_url) {
	++page_scans_in_progress;
	portscanner.findAPortNotInUse(9000, 9999, 'localhost', function(error, port) {
		console.log('Using port: ' + port);
		phantom.create('--load-images=no',{'port': port}, function(ph) {
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
}

// This cheats and sends back "/" in the case of an off-site URL
var normalise_url = function (page_url, href) {
	var resolved = url.resolve(page_url, href);
	var http_start = 'http://' + root_domain;
	var https_start = 'https://' + root_domain;
	if(resolved.startsWith(http_start)) {
		return resolved.substr(http_start.length);
	}
	if(resolved.startsWith(https_start)) {
		return resolved.substr(https_start.length);
	}
	if(resolved.startsWith("http://") || resolved.startsWith("https://")) {
		// This must be offsite
		return "/";
	}
	return resolved;
}

var url_bank = (function () {

	stored_urls = {};

	return {
		add: function(page_url) {
			if(stored_urls.hasOwnProperty(page_url)) {
				return;
			}
			stored_urls[page_url] = page_url;
			enqueue_page_scan(page_url);
		}
	};

}());

var queue = [];
var consume_queue_timeout = 0;

var enqueue_page_scan = function (page_url) {
	if(page_scans_in_progress < concurrency) {
		console.log("Scanning " + page_url + " right now.")
		try {
			begin_page_scan(page_url);
		} catch(error) {
			console.log("===ERROR (enqueue_page_scan)=== " + error);
		}
	} else {
		console.log("Adding " + page_url + " to queue["+ queue.length +"]...")
		queue.push(page_url);
		wait();
	}
};

var wait = function () {
	clearTimeout(consume_queue_timeout);
	consume_queue_timeout = setTimeout(consume_queue, 500);
};

var consume_queue = function () {
	console.log("Checking queue; page_scans_in_progress=" +
		page_scans_in_progress + "; queue.length=" + queue.length);
	if(page_scans_in_progress >= concurrency) {
		wait();
		return;
	}
	if(queue.length > 0) {
		var full_url = url.resolve("http://samsalisbury.net/", queue.pop());
		console.log('=== Beginning scan of ' + full_url);
		try {
			begin_page_scan(full_url);
		} catch(error) {
			console.log("===ERROR (consume_queue)=== " + error);
		}
		wait();
		return;
	}
	exit();
};

enqueue_page_scan("http://samsalisbury.net");