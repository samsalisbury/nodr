
exports.go = function (domain, done_callback, log) {
	var crawler = new Crawler(domain, done_callback, log);

	crawler.start();
};

function Crawler(domain, done, log) {

	var root_domain = domain;
	var phantom = require('phantom');
	var url = require('url');

	// Should be passed on command line:
	var concurrency = 100;
	var queue_poll_frequency = 1;
	var port_number = 9999;
	// End should be passed on command line

	phantom.onError = function (msg, trace) {
		log.error("PhantomJS ERROR:::" + msg);
		trace.forEach(function(item) {
			log.error('  ', item.file, ':', item.line);
		});
	};

	var create_spies = function () {
		window.anchor_spy = function () {
			var anchors = document.getElementsByTagName('a');
			var urls = [];
			for(var i = 0; i < anchors.length; ++i) {
				urls.push(anchors[i].getAttribute('href'));
			}
			return urls;
		};
		window.static_resources_spy = function () {
			var static_resources = [];
			var images = document.getElementsByTagName('img');
			for(var i = 0; i < images.length; ++i) {
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
			return static_resources;
		};
	};

	var jobs_in_progress = 0;
	var begin_page_scan = function (page_url, relative_url) {
		++jobs_in_progress;
		with_open_page(page_url, function(page, done) {
			log.debug("Successfuly opened " + page_url);
			log.progress('.');
			analyse_page(relative_url, page_url, page, done);
		}, function (page, status, done) {
			log.warn("Failed to open " + page_url + "(" + status + ")");
			url_bank.failed(page_url);
			--jobs_in_progress;
			done(page);
		});
	};

	var analyse_page = function (relative_url, page_url, page, done) {
		page.evaluate(create_spies, function() {
			page.evaluate(function () {
				return {
					urls: window.anchor_spy(),
					static_resources: window.static_resources_spy()
				};
			}, function (data) {
				if(data) {
					log.progress('.');
					for(var i in data.urls) {
						if(data.urls.hasOwnProperty(i)) {
							var normalised_url = normalise_url(relative_url, data.urls[i]);
							url_bank.add(normalised_url);
						}
					}
					url_bank.add_static_resources(relative_url, data.static_resources);
				} else {
					log.error("NO DATA RETURNED FROM " + page_url);
					url_bank.failed(page_url);
				}
				--jobs_in_progress;
				done(page);
			});
		});
	};

	var with_open_page = function (page_url, handle_success, handle_failure) {
		var cleanup = function (page) {
			page.close();
		};
		with_page(function(page) {
			page.open(page_url, function (status) {
				if(status === 'success') {
					handle_success(page, cleanup);
				} else {
					handle_failure(page, status, cleanup);
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
		if(the_phantom === null) {
			if(waiting_for_the_phantom) {
				setTimeout(function () {
					with_phantom(callback);
				}, 100);
			} else {
				waiting_for_the_phantom = true;
				++jobs_in_progress;
				log.warn("Creating new phantom instance...");
				log.warn('Using port: ' + port_number);
				phantom.create('--load-images=no',{'port': port_number}, function(ph) {
					the_phantom = ph;
					callback(the_phantom);
					--jobs_in_progress;
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
	// or any other URL we don't want to process. Since  '/' is always the
	// first URL processed.
	var normalise_url = function (page_url, href) {
		if(typeof page_url !== 'string') {
			console.log("page_url = " + typeof page_url);
			return '/';
		}
		if(typeof href !== 'string') {
			console.log("href = " + typeof href);
			return '/';
		}
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

	var do_not_scan_patterns = [
		/^mailto\:/i,
		/^tel\:/i,
		/^javascript\:/i,
		/\.pdf$/i,
		/\.zip$/i,
		/\.exe$/i
	];

	function any_match(patterns, subject) {
		for(var i in patterns) {
			if(subject.match(patterns[i])) {
				return true;
			}
		}
		return false;
	}

	function any_have_key (hashes, key) {
		for(var i = 0; i < hashes.length; ++i) {
			if(hashes[i].hasOwnProperty(key)) {
				return true;
			}
		}
		return false;
	}

	var url_bank = (function () {
		var stored_urls = {};
		var failed_urls = {};
		var not_scanned = {};
		return {
			add: function(page_url) {
				// Don't add the same page twice
				if(any_have_key([stored_urls,failed_urls,not_scanned], page_url)) {
					return;
				}
				// Filter out URLs we're not interested in
				if(any_match(do_not_scan_patterns, page_url)) {
					not_scanned[page_url] = 1;
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
		log.debug("Adding " + page_url + " to queue["+ queue.length +"]...");
		log.progress('.');
		queue.push(page_url);
		wait();
	};

	var this_waiter = 0;
	var wait = function () {
		clearTimeout(this_waiter);
		this_waiter = setTimeout(consume_queue, queue_poll_frequency);
	};

	var phantom_killed = false;

	var print_status = function () {
		var status_message = "TIME ELAPSED: " + Math.floor(t()) + "s, Queue size: " + queue.length + "; Jobs in progress: " + jobs_in_progress;
		log.info(status_message);
	};

	// print status roughly every 5 seconds
	var print_status_every = 5000/queue_poll_frequency;
	var status_counter = 0;

	var maybe_print_status = function () {
		if(status_counter++ === print_status_every) {
			status_counter = 0;
			print_status();
		}
	};

	var consume_queue = function () {
		maybe_print_status();
		if(jobs_in_progress >= concurrency) {
			// Can't have any more concurrent scans, wait in line...
			wait();
		} else if(queue.length > 0) {
			var relative_url = queue.pop();
			var full_url = url.resolve("http://"+root_domain+"/", relative_url);
			log.debug('Getting ' + full_url);
			log.progress('.');
			try {
				begin_page_scan(full_url, relative_url);
			} catch(error) {
				log.error(error);
			}
			wait();
		} else if(jobs_in_progress > 0) {
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
			enqueue_page_scan("http://" + root_domain + "/", "/");
		}
	};
}