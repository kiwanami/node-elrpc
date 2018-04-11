// -*- coding: utf-8; -*-

"use strict";

var util			= require('util');
var net				= require("net");
var child_process	= require("child_process");
var log4js			= require("log4js");
var isPromise		= require("p-is-promise");
var elparser		= require("elparser");

var _uidCount = 1;

var genuid = function() {
	return _uidCount++;
};

var symbol = function(name) {
	return new elparser.ast.SExpSymbol(name);
};

var deferred = function() {
	var resolve, reject;
	var promise = new Promise(function(_resolve, _reject) {
		resolve = _resolve;
		reject = _reject;
	});
	return {
		promise: promise,
		resolve: resolve,
		reject: reject
	};
};

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

var _defaultLogger = null;

var initLogger = function() {
	if (_defaultLogger) return _defaultLogger;
	var appender = {
		type: 'console',
		layout: {
			type: "pattern",
			pattern: "%5p | %m"
		},
		category: "log"
	};
	log4js.configure({appenders: [appender]});
	
	var logger = log4js.getLogger('log');
	logger.setLevel("DEBUG"); // debug level
	logger.setLevel("WARN");

	_defaultLogger = logger;
	
	return logger;
};



/**
 * Bind and Listen the TCP Server port and return RPCServer object.
 * @param {Method[]} [methods] 
 * @param {number} [port] 
 * @return Promise RPCServer
 */
var startServer = function(methods, port) {
	if (!port) port = 0; // choosed by the system
	var d = deferred();
	var serverSocket = net.createServer(function(conn) {
		var svr = new RPCServer("server", conn, methods);
		svr.addCloseHook(function() {
			serverSocket.close();
			initLogger().debug("Stop Listening ServerSocket");
		});
		d.resolve(svr);
	});
	serverSocket.listen(port, "localhost", 1, function() {
		var addr = serverSocket.address();
		console.log(addr.port);
	});
	return d.promise;
};

/**
 * Connect to the TCP port and return RPCServer object.
 * @param {number} port 
 * @param {Method[]} [methods] 
 * @param {string} [host] 
 * @return Promise RPCServer
 */
var startClient = function(port, methods, host) {
	if (!host) host = "127.0.0.1";
	var d = deferred();
	try {
		var socket = net.createConnection(port, host, function() {
			var client = new RPCServer("client", socket, methods);
			d.resolve(client);
		});
		return d.promise;
	} catch (e) {
		return Promise.reject(e);
	}
};

/**
 * Execute the command and return PeerProcess object which
 * has a RPCServer object.
 * @param {string[]} cmd - command for starting EPC Peer Process, such as ["node", "_echo.js"]
 * @return Promise PeerProcess
 */
var startProcess = function(cmd) {
	var svr = new PeerProcess(cmd);
	try {
		return svr.start();
	} catch (e) {
		return Promise.reject(e);
	}
};


/**
 * @param {string[]} cmd command line elements: ["node", "_echo.js"]
 */
var PeerProcess = function(cmd) {
	this.cmd = cmd;
	this.status = 'not_started';
};

/**
 * Spawn EPC peer process, wait for connection port number and
 * return a EPCServer object.
 * @return Promise self
 */
PeerProcess.prototype.start = function() {
	this.status = "start_pre";
	var d = deferred();
	var cmd = this.cmd[0];
	var args = this.cmd.slice(1);
	var port = null;
	var logger = initLogger();
	logger.debug("Process CMD: "+this.cmd.join(" "));
	var that = this;
	this.process = child_process.spawn(cmd, args);
	this.status = "start_spawned";
	this.process.stdout.on('data', function(data) {
		if (!port) {
			try {
				port = parseInt(data.toString(),10);
				if (isNaN(port)) {
					logger.error("Wrong Port Number: "+data);
					port = null;
					return;
				}
				that.status = "start_port_receive";
				d.resolve(port);
			} catch (e) {
				d.reject(e);
			}	
		} else {
			logger.debug("PEER: "+data.toString());
		}
	});
	this.process.stderr.on('data',function(data) {
		that.status = "start_error";
		logger.warn(data.toString());
	});

	return d.promise.then(function(_port) {
		return startClient(_port).then(function(client) {
			that.client = client;
			client.addCloseHook(function() {
				that.status = "closed";
				that.process.kill("SIGTERM");
			});
			that.status = "start_establised";
			return that;
		});
	});
};

PeerProcess.prototype.registerMethod = function(method) {
	return this.client.registerMethod(method);
};

PeerProcess.prototype.defineMethod = function(name, body, argdoc, docstring) {
	return this.client.defineMethod(name, body, argdoc, docstring);
};

/**
 * Call peer's method
 * @param {string} name - method name to call
 * @param {...*} args - arguments to pass
 * @return Promise with return value
*/
PeerProcess.prototype.callMethod = function(/* name, args...*/) {
	return this.client.callMethod.apply(this.client, arguments);
};

/**
 * Return a list of peer's method.
 * @return [[name, argdoc, method doc],.. ]
 */
PeerProcess.prototype.queryMethod = function() {
	return this.client.queryMethod();
};

/**
 * Send shutdown signal to the peer process and dispose the resources.
 */
PeerProcess.prototype.stop = function() {
	this.status = "closing";
	return this.client.stop();
};



var Method = function(name, body, argdoc, docstring) {
	this.name = name;
	this.body = body;
	this.argdoc = argdoc || "";
	this.docstring = docstring || "";
};

Method.prototype.invoke = function(args) {
	return this.body.apply(null, args);
};

var EPCRuntimeException = function(message) {
	this.message = message;
};

EPCRuntimeException.prototype.getMessage = function() {
	return this.message;
};

var EPCStackException = function(message) {
	this.message = message;
};

EPCStackException.prototype.getMessage = function() {
	return this.message;
};



var CallMessage = function(uid, method, args, deferred) {
	this.uid = uid;
	this.method = method;
	this.args = args;
	this.deferred = deferred;
};

CallMessage.prototype.toJSON = function() {
	return [symbol("call"), this.uid, this.method, this.args];
};

var MethodsMessage = function(uid, deferred) {
	this.uid = uid;
	this.deferred = deferred;
};

MethodsMessage.prototype.toJSON = function() {
	return [symbol("methods"), this.uid];
};

var ReturnMessage = function(uid, value) {
	this.uid = uid;
	this.value = value;
};

ReturnMessage.prototype.toJSON = function() {
	return [symbol("return"), this.uid, this.value];
};

var ErrorMessage = function(uid, errorMessage) {
	this.uid = uid;
	this.errorMessage = errorMessage;
};

ErrorMessage.prototype.toJSON = function() {
	return [symbol("return-error"), this.uid, this.errorMessage];
};

var EPCErrorMessage = function(uid, errorMessage) {
	this.uid = uid;
	this.errorMessage = errorMessage;
};

EPCErrorMessage.prototype.toJSON = function() {
	return [symbol("epc-error"), this.uid, this.errorMessage];
};


/**
 * @param {string} name server name for debugging
 * @param {net.Socket} socket 
 * @param {Method[]} [methods] (optional)
 */
var RPCServer = function(name, socket, methods) {
	this.name = name;
	this.socket = socket;
	this.socketState = "socket_opened";
	this.methods = {}; // name -> Method

	this.logger = initLogger();
	this.session = {}; // uid -> function

	this.receiveBuffer = new Buffer(0);
	this.socket.on('data', function(chunk) {
		this._onReceiveData(chunk);
	}.bind(this));

	this.socket.on('end',function() {
		this.logger.info("!Socket closed by peer.");
		this.stop();
	}.bind(this));

	this.queueState = QueueState.GO;
	this.socket.on('drain', function() {
		this.queueState.ondrain.call(this);
	}.bind(this));
	this.queueStream = []; // [CallMessage]
	this.closeHooks = []; // [function ()->()]

	if (methods) methods.forEach( function(m) {
		this.registerMethod(m);
	},this);
};

RPCServer.prototype.addCloseHook = function(hook) {
	if (this.closeHooks.indexOf(hook) >= 0) return;
	this.closeHooks.push(hook);
};

RPCServer.prototype._onReceiveData = function(chunk) {
	if (chunk) this.receiveBuffer = Buffer.concat([this.receiveBuffer,chunk]);
	var buf = this.receiveBuffer;
	if (buf.length >= 6) {
		var str = buf.slice(0,6).toString();
		this.logger.debug("<< H:"+str);
		var len = parseInt(str,16);
		if (isNaN(len) || len <= 0) {
			this.logger.error("Wrong Content Length: "+str+" -> "+len);
			this.stop(); // reset connection
			return;
		}
		if (len > (buf.length-6)) {
			this.logger.debug("Wait for more input: "+(buf.length-6)+"/"+len);
			return; // wait for subsequent data.
		}
		var content = buf.slice(6, 6+len).toString();
		if (this.logger.isDebugEnabled()) this.logger.debug("<< B:"+content);
		this.receiveBuffer = buf.slice(6+len);
		var obj;
		try {
			obj = elparser.parse1(content);
		} catch (e) {
			this.logger.warn("Parse Error : "+e, e);
			return;
		}
		try {
			this._dispatchHandler(obj);
		} catch (e) {
			this.logger.warn("Dispatch Error : "+e, e);
			return;
		}
		this.logger.debug("Dispatch OK");
		if (this.receiveBuffer.length > 6) {
			this.logger.debug("Try to read the next buffer.");
			this._onReceiveData(null);
		} else {
			this.logger.debug("Wait for next data chunk.");
		}
	}
};

RPCServer.prototype._dispatchHandler = function(msg) {
	//this.logger.debug("MSG: ", msg);
	msg = msg.toJS();
	var type = msg.shift();
	switch (type) {
	case "quit":
		this.logger.debug("Quit Message Received.");
		this.stop();
		break;
	case "call":
		this._handlerCall(msg[0], msg[1], msg[2]);
		return;
	case "return":
		this._handlerReturn(msg[0], msg[1]);
		return;
	case "return-error":
		this._handlerErrorReturn(msg[0], new EPCRuntimeException(msg[1]));
		return;
	case "epc-error":
		this._handlerErrorReturn(msg[0], new EPCStackException(msg[1]));
		return;
	case "methods":
		this._handlerMethods.apply(this, msg);
		return;
	default:
		this.logger.warn("Unknown Message Type : "+type);
	}
};

RPCServer.prototype._handlerCall = function(uid, name, args) {
	this.logger.debug("Handler Call: "+uid+" / "+name+" / "+args);
	var method = this.methods[name];
	if (method) {
		try {
			var ret = method.invoke(args);
			if (isPromise(ret)) {
				ret.then(function(_ret) {
					this._queueMessage(new ReturnMessage(uid, _ret));
				}.bind(this));
				this.logger.debug("Method ["+name+"] returns promise object.");
			} else {
				this._queueMessage(new ReturnMessage(uid, ret));
			}
		} catch (e) {
			this.logger.debug("Method ["+name+"] throw an error : "+e, e);
			this._queueMessage(new ErrorMessage(uid, e.toString()));
		}
	} else {
		this.logger.warn("Method ["+name+"] not found.");
		this._queueMessage(new EPCErrorMessage(uid, "Not found the method: "+name));
	}
	this.logger.debug("Handler Call OK");
};

RPCServer.prototype._handlerReturn = function(uid, value) {
	var m = this.session[uid];
	if (m) {
		delete this.session[uid];
		m.deferred.resolve(value);
	}
};

RPCServer.prototype._handlerErrorReturn = function(uid, error) {
	var m = this.session[uid];
	if (m) {
		delete this.session[uid];
		m.deferred.reject(error);
	}
};

RPCServer.prototype._handlerMethods = function(uid) {
	this.logger.debug("Handler Methods: "+uid);
	var ret = Object.keys(this.methods).map(function(k) {
		var m = this.methods[k];
		return [symbol(k), m.argdoc, m.docstring];
	},this);
	var msg = new ReturnMessage(uid, ret);
	this._queueMessage(msg);
	this.logger.debug("Handler Methods OK");
};



RPCServer.prototype.registerMethod = function(method) {
	this.methods[method.name] = method;
	return method;
};

RPCServer.prototype.defineMethod = function(name, body, argdoc, docstring) {
	return this.registerMethod(new Method(name,body,argdoc,docstring));
};

RPCServer.prototype.callMethod = function() {
	var args = Array.prototype.slice.call(arguments, 0);
	var name = args.shift();
	
	var d = deferred();
	var uid = genuid();
	var msg = new CallMessage(uid, name, args, d);
	this.session[uid] = msg;
	this._queueMessage(msg);
	return d.promise;
};

RPCServer.prototype.queryMethod = function() {
	var d = deferred();
	var uid = genuid();
	var msg = new MethodsMessage(uid, d);
	this.session[uid] = msg;
	this._queueMessage(msg);
	return d.promise;
};

/**
 * Stop the RPCServer connection.
 * All live sessions are terminated with EPCStackException error.
 */
RPCServer.prototype.stop = function() {
	this.logger.debug("Stop Signal");
    if (this.socketState == "socket_opened") {
		this.logger.debug("PeerProcess.stop: received!");
		this.socketState = "socket_closing";
		this.socket.end();
		this._queueMessage(null);
		this._clearWaitingSessions();
		this.socketState = "socket_not_connected";
		this.closeHooks.forEach( function(f) {
			if (f) f.call();
		});
		this.logger.debug("PeerProcess.stop: completed");
	}
};

RPCServer.prototype._clearWaitingSessions = function() {
	var keys = Object.keys(this.session);
	keys.forEach( function(uid) {
		this._handlerReturn(uid, "EPC Connection closed", null);
	},this);
};

// 'this' will be set to the RPCServer instance
var QueueState = {
	GO : {
		ondrain: function() {
			this.logger.debug("QueueState.GO.ondrain");
			// do nothing
		},
		onqueue: function(msg) {
			if (!msg) return;
			this.logger.debug("QueueState.GO.onqueue : "+msg.uid);
			this.queueStream.push(msg);
			this._send();
		}
	},
	STOP : {
		ondrain: function() {
			this.logger.debug("QueueState.STOP.ondrain : num="+this.queueStream.length);
			this.queueState = QueueState.GO;
			this._send();
		},
		onqueue: function(msg) {
			if (!msg) return;
			this.logger.debug("QueueState.STOP.onqueue : "+msg.uid);
			this.queueStream.push(msg);
		}
	}
};

RPCServer.prototype._queueMessage = function(msg) {
	this.queueState.onqueue.call(this, msg);
};

RPCServer.prototype._send = function() {
	if (this.queueStream.length == 0) return; // do nothing
	var msg = this.queueStream.shift();
	if (msg == null) return; // ignore finish signal
	this.logger.debug("Stream.write : "+msg.uid);
	var strBody;
	try {
		strBody = elparser.encode(msg.toJSON(), true);
	} catch (e) {
		if (msg instanceof ReturnMessage) {
			// re-send error message with wrapping EPCStackException
			this._queueMessage(new EPCErrorMessage(msg.uid, e.message));
			this.logger.warn("Encoding error "+e.message+" / recover error message.",e);
			this._send();
			return;
		}
		if (msg instanceof CallMessage) {
			// return error message to the local client with wrapping EPCStackException
			this._handlerErrorReturn(msg.uid, new EPCStackException(e.message));
			this.logger.warn("Encoding error "+e.message+" / recover error message.",e);
			this._send();
			return;
		}
		this._send();
		this.logger.error("Encoding error "+e.message+" / Could not recover the messaging.");
		return;
	}
	if (this.logger.isDebugEnabled()) this.logger.debug("Encode : "+strBody);
	var buf = new Buffer(strBody, "utf8");
	var len = buf.length;
	var bufok = this.socket.write(new Buffer(padRight(len.toString(16),"0",6)+strBody,'utf8'));
	this.logger.debug("Stream.ok : uid="+msg.uid+" / "+len+"bytes / buf:"+bufok);
	if (bufok) this._send();
	else {
		this.queueState = QueueState.STOP;
	}
};


/**
 * Wait for finishing this RPCServer connection.
 * @return Promise
 */
RPCServer.prototype.wait = function() {
	var that = this;
	var d = deferred();
	var waitFunc = function() {
		setTimeout(function() {
			if (that.socketState != "socket_opened") {
				d.resolve();
			} else {
				waitFunc();
			}
		},100);
	};
	waitFunc();
	return d.promise;
};



module.exports = {
	startServer: startServer,
	startClient: startClient,
	startProcess: startProcess,
	Method: Method,
	EPCStackException: EPCStackException,
	EPCRuntimeException: EPCRuntimeException
};

