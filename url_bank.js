exports.create = function () {
    var stored_urls = {};
    var failed_urls = {};
    var not_scanned = {};
    return {
        add: function(page_url, should_scan_callback) {
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
            should_scan_callback(page_url);
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
        failed: function(page_url, status) {
            // this indicates that a page could not be scanned
            delete stored_urls[page_url];
            failed_urls[page_url] = { status: status };
        }
    };
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