var counter = require('./counter.js');
var phantom_evaluator = require('./phantom-evaluator.js');
var url_bank_factory = require('./url_bank');
var url = require('url');

exports.go = function (domain, done_callback, log) {
	var crawler = new Crawler(domain, done_callback, log);

	crawler.start();
};

function Crawler(domain, done, log) {

	var root_domain = domain;
	var url = require('url');

    var jobs_in_progress = counter.create();
    var url_bank = url_bank_factory.create();

    var normalise_url = function(page_url, href) {
        return normalise_url_with_root(page_url, href, root_domain);
    };

    var queue = [];

    var enqueue_page_scan = function (page_url) {
        log.debug("Adding " + page_url + " to queue["+ queue.length +"]...");
        log.progress('.');
        queue.push(page_url);
        wait();
    };

    var evaluator = phantom_evaluator.create(log, jobs_in_progress, url_bank, normalise_url, enqueue_page_scan);

	// Should be passed on command line:
	var concurrency = 100;
	var queue_poll_frequency = 1;
	// End should be passed on command line


	var this_waiter = 0;
	var wait = function () {
		clearTimeout(this_waiter);
		this_waiter = setTimeout(consume_queue, queue_poll_frequency);
	};

	var print_status = function () {
		var status_message = "TIME ELAPSED: " + Math.floor(t()) + "s, Queue size: " + queue.length + "; Jobs in progress: " + jobs_in_progress.value();
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
		if(jobs_in_progress.value() >= concurrency) {
			// Can't have any more concurrent scans, wait in line...
			wait();
		} else if(queue.length > 0) {
			var relative_url = queue.pop();
			var full_url = url.resolve("http://" + root_domain + "/", relative_url);
			log.debug('Getting ' + full_url);
			log.progress('.');
			try {
				evaluator.begin_page_scan(full_url, relative_url);
			} catch(error) {
				log.error(error);
			}
			wait();
		} else if(jobs_in_progress.value() > 0) {
			// Need to wait until all the scans finish before we can exit.
			wait();
		} else {
			// Nothing left to do, send the results...
			var time_taken = t();
			done(format_results_for_return(time_taken));
			evaluator.destruct();
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
				pages_failed.push({
                    url: failures[i].url,
                    status: failures[i].status
                });
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

String.prototype.startsWith = function (other) {
    return this.substr(0, other.length) == other;
};

// This cheats and sends back "/" in the case of an off-site URL
// or any other URL we don't want to process. Since  '/' is always the
// first URL processed.
function normalise_url_with_root (page_url, href, root_domain) {
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
}