// -*- coding: utf-8; -*-

var epc = require("../index.js");
var Promise = require("bluebird");

//var profiler = require('v8-profiler');

var padRight = function(str, pad, num) {
	var len = str.length;
	if (len == num) {
		return str;
	} else if (len > num) {
		return str.substring(len-num, num);
	} else {
		return (new Array(num-len+1).join(pad))+str;
	}
};

function benchmark(client, title, data, iterationNum) {
	var startTime = new Date();
	var results = [];
	for (var i = 0; i < iterationNum; i++) {
		results.push(client.callMethod("echo", data));
	}

	return Promise.all(results).then(function(xx) {
		var time = new Date().getTime() - startTime.getTime();
		console.log(padRight(title+": ", " ", 10)+
					padRight(time+"ms", " ", 10)+" "+
					padRight((1000.0/time*iterationNum).toFixed(2)+" msg/sec", " ", 20));
	}, function(err) {
		console.log("Fail",err);
	});
}

//profiler.startProfiling('echo-bench');

epc.startProcess(["node", "./test/_echo.js"]).then(function(cl) {
	//cl.client.logger.setLevel("DEBUG");
	var array = [];
	var hash = {};
	var str = "";
	var a;
	for (var i = 0; i < 100; i++) {
		a = Math.random()*10000;
		array.push(a);
		hash[""+a] = Math.random()*10000;
		str += a;
	}

	//console.log(str,array,hash);

	var n = 1000;

	var src = [
		{title: 'int', data: 1},
		{title: 'float', data: 12.34},
		{title: 'str', data: str},
		{title: 'array', data: array},
		{title: 'hash', data: hash},
	];

	Promise.reduce(src.concat(src), function(sum, elt) {
		return benchmark(cl, elt.title, elt.data, n);
	}, Promise.resolve()).then(function() {
		cl.stop();
		//var cpuProfile = profiler.stopProfiling('echo-bench');
		//console.log(JSON.stringify(cpuProfile));
	});
});
