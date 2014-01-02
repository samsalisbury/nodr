exports.create = function () {

    var val = 0;

    return {
        increment: function() {
            ++val;
        },
        decrement: function() {
            --val;
        },
        value: function() {
            return val;
        }
    };

};