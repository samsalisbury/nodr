
var phantom = require('phantom');
var url = require('url');

// Should be passed on command line:
var concurrency = 30;
var queue_poll_frequency = 10;
var port_number = 9999;
// End should be passed on command line

phantom.onError = function (msg, trace) {
	console.log(msg);
	trace.forEach(function(item) {
		console.log('  ', item.file, ':', item.line);
	});
};

var page_scans_in_progress = 0;
var begin_page_scan = function (page_url) {
	++page_scans_in_progress;
	with_page(function(page) {
		page.open(page_url, function(status) {
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
				--page_scans_in_progress;
			});
		});
	});
};

var with_page = function (callback) {
	with_phantom(function(ph) {
		ph.createPage(function(page) {
			callback(page);
		});
	});
};

var the_phantom = null;
var waiting_for_the_phantom = false;

function with_phantom(callback) {
	if(the_phantom == null) {
		if(waiting_for_the_phantom) {
			setTimeout(function () {
				with_phantom(callback);
			}, 100);
		} else {
			// TODO: Rename this to jobs-in-progress
			++page_scans_in_progress;
			console.log("Creating new phantom instance...");
			waiting_for_the_phantom = true;
			console.log('Using port: ' + port_number);
			phantom.create('--load-images=no',{'port': port_number}, function(ph) {
				the_phantom = ph;
				callback(the_phantom);
				--page_scans_in_progress;
			});
		}
	} else {
		callback(the_phantom);
	}
}


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

var enqueue_page_scan = function (page_url) {
	console.log("Adding " + page_url + " to queue["+ queue.length +"]...")
	queue.push(page_url);
	wait();
};

var this_waiter = 0;
var wait = function () {
	clearTimeout(this_waiter);
	this_waiter = setTimeout(consume_queue, queue_poll_frequency);
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
		print_results();
		the_phantom.exit();
	}
};

var root_domain = process.argv.slice(2)[0];

var timer = function () {
	var startTime = process.hrtime();
	return function () {
		var diff = process.hrtime(startTime);
		return (diff[0] * 1e9 + diff[1]) / 1e9;
	};
};
var t = timer();
enqueue_page_scan("http://" + root_domain);

function print_results() {
	console.log("Total of " + url_bank.count() + " URLs found:");
	for(var u in url_bank.all()) {
		console.log(u);
	}
	console.log("Total of " + url_bank.count() + " URLs found in " + t() + "s");
}