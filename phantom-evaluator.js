var phantom = require('phantom');

phantom.stderrHandler = function (message) {
    if(message.match(/(No such method.*socketSentData)|(CoreText performance note)|(WARNING: Method userSpaceScaleFactor in class NSView is deprecated on 10.7 and later.)/))
        return;
    console.error(message);
}

exports.create = function (log, jobCounter, url_bank, normalise_url, enqueue_page_scan) {

    var the_phantom = null;
    var waiting_for_the_phantom = false;
    var port_number = 9999;

    function destruct() {
        the_phantom.exit();
    }

    function begin_page_scan(page_url, relative_url) {
        jobCounter.increment();
        with_open_page(page_url, function(page, done) {
            log.debug("Successfully opened " + page_url);
            log.progress('.');
            analyse_page(relative_url, page_url, page, done);
        }, function (page, status, done) {
            log.warn("Failed to open " + page_url + "(" + status + ")");
            url_bank.failed(page_url);
            jobCounter.decrement();
            done(page);
        });
    }

    function analyse_page(relative_url, page_url, page, done) {
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
                            url_bank.add(normalised_url, enqueue_page_scan);
                        }
                    }
                    url_bank.add_static_resources(relative_url, data.static_resources);
                } else {
                    log.error("NO DATA RETURNED FROM " + page_url);
                    url_bank.failed(page_url);
                }
                jobCounter.decrement();
                done(page);
            });
        });
    }

    phantom.onError = handle_in_page_error;

    function handle_in_page_error(msg, trace) {
        log.error("PhantomJS ERROR::" + msg);
        trace.forEach(function(item) {
            log.error('  ', item.file, ':', item.line);
        });
    }


    function with_phantom(callback) {
        if(the_phantom === null) {
            if(waiting_for_the_phantom) {
                setTimeout(function () {
                    with_phantom(callback);
                }, 100);
            } else {
                waiting_for_the_phantom = true;
                jobCounter.increment();
                log.warn("Creating new phantom instance...");
                log.warn('Using port: ' + port_number);
                phantom.create('--load-images=no', {'port': port_number}, function(ph) {
                    the_phantom = ph;
                    callback(the_phantom);
                    jobCounter.decrement();
                });
            }
        } else {
            callback(the_phantom);
        }
    }

    function with_open_page(page_url, handle_success, handle_failure) {
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
    }

    function with_page(callback) {
        with_phantom(function(ph) {
            ph.createPage(function(page) {
                callback(page);
            });
        });
    }

    return {
        begin_page_scan: begin_page_scan,
        destruct: destruct
    };
}

function create_spies () {
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
}