var express = require('express');
var app = express();

app.get('/', function(req, res){
	res.sendfile(__dirname + '/page.html');
});

app.get('/404', function(req, res){
	res.send(404);
})

app.listen(3000);