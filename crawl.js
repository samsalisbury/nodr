
exports.go = function (domain, done_callback) {
	var crawler = new Crawler(domain, done_callback);

	crawler.start();
}

function Crawler(domain, done) {

	var root_domain = domain;
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
					// Inside page.evaluate, the function has no access
					// to the rest of the local or global variables, it
					// runs entirely in the scope of the browser.
					// This makes it really difficult to refactor this lot
					// into anything much more readable.
					page.evaluate(function () {
						var anchors = document.getElementsByTagName('a');
						var urls = [];
						for(var i = 0; i < anchors.length; ++i) {
							urls.push(anchors[i].getAttribute('href'));
						}
						var static_resources = [];
						var images = document.getElementsByTagName('img');
						for(i = 0; i < images.length; ++i) {
							static_resources.push(images[i].getAttribute('src'));
						}
						var links = document.querySelectorAll('link');
						for(i = 0; i < links.length; ++i) {
							var href = links[i].getAttribute(href);
							if(href) {
								static_resources.push(href);
							}
						}
						var scripts = document.getElementsByTagName('script');
						for(i = 0; i < scripts.length; ++i) {
							var script_src = scripts[i].getAttribute('src');
							if(script_src) {
								static_resources.push(script_src);
							}
						}

						return {
							urls: urls,
							static_resources: static_resources
						};
					}, function (data) {
						for(var i in data.urls) {
							var normalised_url = normalise_url(page_url, data.urls[i]);
							url_bank.add(normalised_url);
						}
						url_bank.add_static_resources(page_url, data.static_resources);
						--page_scans_in_progress;
					});
				} else {
					console.log("Failed to open " + page_url + "(" + status + ")");
					url_bank.failed(page_url);
					--page_scans_in_progress;
				}
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
		var stored_urls = {};
		var failed_urls = {};
		return {
			add: function(page_url, static_resources) {
				if(stored_urls.hasOwnProperty(page_url) || failed_urls.hasOwnProperty(page_url)) {
					return;
				}
				stored_urls[page_url] = [];
				enqueue_page_scan(page_url);
			},
			add_static_resources: function(page_url, static_resources) {
				stored_urls[page_url] = static_resources;
			},
			all: function() {
				return stored_urls;
			},
			failures: function () {
				return failed_urls;
			},
			count: function() {
				var count = 0;
				for(var i in stored_urls) {
					if(stored_urls.hasOwnProperty(i)) {
						++count;
					}
				}
				return count;
			},
			failed: function(page_url) {
				// this indicates that a page could not be scanned
				delete stored_urls[page_url];
				failed_urls[page_url] = 1;
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
		if(page_scans_in_progress >= concurrency) {
			// Can't have any more concurrent scans, wait in line...
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
			// Need to wait until all the scans finish before we can exit.
			wait();
		} else {
			// Nothing left to do, send the results...
			var time_taken = t();
			done(format_results_for_return(time_taken));
			the_phantom.exit();
		}
	};

	var format_results_for_return = function (time_taken) {
		var pages_scanned = [];
		var all = url_bank.all();
		for(var i in all) {
			if(all.hasOwnProperty(i)) {
				pages_scanned.push({
					'url': i,
					'static_resources': all[i]
				});
			}
		}
		var pages_failed = [];
		var failures = url_bank.failures();
		for(i in failures) {
			if(failures.hasOwnProperty(i)) {
				pages_failed.push(i);
			}
		}

		return {
			time_taken: time_taken,
			total_pages_scanned: pages_scanned.length,
			total_pages_failed: pages_failed.length,
			pages_failed: pages_failed,
			pages_scanned: pages_scanned
		};
	};

	var timer = function () {
		var startTime = process.hrtime();
		return function () {
			var diff = process.hrtime(startTime);
			return (diff[0] * 1e9 + diff[1]) / 1e9;
		};
	};

	var t;

	return {
		start: function () {
			t = timer();
			enqueue_page_scan("http://" + root_domain);
		}
	};
}