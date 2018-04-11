// -*- coding: utf-8; -*-

var epc = require("../index.js");

var server;
epc.startServer([], 8888).then(function(server) {
	server.defineMethod("echo", function(args) {
		return new Promise(function(resolve) {
			setTimeout(function() {
				resolve(args);
			}, 0);
		});
	});
	server.wait();
});
