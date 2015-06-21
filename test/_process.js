// -*- coding: utf-8; -*-

var epc = require("../index.js");

epc.startServer().then(function(server) {
	server.wait();
});
