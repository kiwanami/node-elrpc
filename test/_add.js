// -*- coding: utf-8; -*-

var epc = require("../index.js");

var server;
epc.startServer([], 8888).then(function(server) {
	server.defineMethod("add", function(a, b) {
		return a + b;
	});
	server.wait();
});
