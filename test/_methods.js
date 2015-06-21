// -*- coding: utf-8; -*-

var epc = require("../index.js");

epc.startServer().then(function(server) {
	server.defineMethod("method1", function(args) {
		return args;
	}, "args", "");
	server.defineMethod("test2", function(args) {
		return args;
	}, "a,b,c", "docstring here...");
	server.defineMethod("test3", function(args) {
		return args;
	});
	server.wait();
});
