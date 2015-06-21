// -*- coding: utf-8; -*-

var epc = require("../index.js");

var server;
epc.startServer([], 8888).then(function(server) {
	server.defineMethod("num_error", function() {
		return  1/0;
	});
	server.defineMethod("raise_error", function() {
		throw "Raise!";
	});
	server.defineMethod("echo", function(arg) {
		return arg;
	});
	server.wait();
});
