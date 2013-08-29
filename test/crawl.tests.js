var assert = require("assert");
var crawl = require("../crawl.js");

describe('crawl', function(){
	describe('#normaliseUrl()', function(){
		it('should resolve relative URLs to absolute URLs', function() {
			var result = crawl.normaliseUrl("some_url", "/root/url");
			assert.equal(result, "/root/url/some_url");
		});
	});
});