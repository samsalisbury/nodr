exports.create = function (minLevel) {
    // 1 = errors only, 2 = warnings, 3 = info, 4 = debug, 5 = trace
    var log_level = minLevel || 2;

    var log = function (message, level) {
        if(!level) {
            throw 'log.log requires you to set a level [1-5]';
        }
        if(log_level >= level) {
            console.log('\n' + message);
        }
    };

    return {
        error: function (message) {
            log(message, 1);
        },
        warn: function (message) {
            log(message, 2);
        },
        info: function (message) {
            log(message, 3);
        },
        debug: function (message) {
            log(message, 4);
        },
        trace: function (message) {
            log(message, 5);
        },
        progress: function (symbol) {
            process.stdout.write(symbol);
        },
        set_min_level: function (level) {
            log_level = level;
        }
    };
};