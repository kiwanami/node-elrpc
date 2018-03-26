// -*- coding: utf-8; -*-

var assert = require('power-assert');
var Promise = require('bluebird');
var spawn = require('child_process').spawn;
var epc = require('../index.js');


function _b(name) {
	return "./test/"+name;
}

describe('01 Process', function() {

	it('should start with port num and getting it', function(done) {
		try {
			var cp = spawn('node',[_b('_echo.js')]);
			cp.stdout.on('data', function(data) {
				try {
					var port = parseInt(data.toString(), 10);
					assert.equal(port, 8888);
					done();
				} catch (err) {
					done(err);
				} finally {
					cp.kill();
				}
			});
			cp.stderr.on('data', function(data) {
				//something wrong
				done(data.toString());
			});
		} catch (err) {
			done(err);
		}
	});

	it('should start without port num and getting the port num', function(done) {
		try {
			var cp = spawn('node',[_b('_process.js')]);
			cp.stdout.on('data', function(data) {
				try {
					var port = parseInt(data.toString(), 10);
					assert.ok(port > 0);
					done();
				} catch (err) {
					done(err);
				} finally {
					cp.kill();
				}
			});
			cp.stderr.on('data', function(data) {
				//something wrong
				done(data.toString());
			});
		} catch (err) {
			done(err);
		}
	});

});

// code : EPCServer -> Promise ()
function withEPC(progname, code) {
	var client;
	try {
		var d = epc.startProcess(['node',_b(progname)]);
		return d.then(function(_client) {
			client = _client;
			return code(client);
		}).then(function(x) {
			client.stop();
		},function(err) {
			client.stop();
			throw err;
		});
	} catch (err) {
		if (client) {
			client.stop();
		}
		return Promise.reject(err);
	}
}

describe('02 Echo', function() {

	it('should echo a message.', function(done) {
		withEPC('_echo.js', function(client) {
			return client.callMethod('echo', 'hello').then(function(ret) {
				assert.ok(typeof(ret) == "string");
				assert.equal(ret, 'hello');
				return client.callMethod('echo', 12345);
			}).then(function(ret) {
				assert.ok(typeof(ret) == "number");
				assert.equal(ret, 12345);
				return client.callMethod('echo', [1, "2", 3.2, false]);
			}).then(function(ret) {
				assert.ok(ret instanceof Array);
				assert.deepEqual(ret, [1, "2", 3.2, null]); // false -> null
			});
		}).then(function() {
			done();
		}, function(err) {
			done(err);
		});
	});

});

describe('03 Add', function() {

	it('should add objects', function(done) {
		withEPC('_add.js', function(client) {
			return client.callMethod('add', 1, 2).then(function(ret) {
				assert.equal(typeof(ret), "number");
				assert.equal(ret, 3);
				return client.callMethod('add', 'A', 'B');
			}).then(function(ret) {
				assert.equal(typeof(ret), "string");
				assert.equal(ret, "AB");
			});
		}).then(function() {
			done();
		}, function(err) {
			done(err);
		});
	});
});

describe('04 Errores', function() {

	it('should return runtime errors', function(done) {
		withEPC('_error.js', function(client) {
			return client.callMethod('raise_error').then(function(ret) {
				assert.ok(false, "raise_error should raise an Exception.");
			}, function(err) {
				assert.ok(err instanceof epc.EPCRuntimeException);
				assert.equal(err.message, "Raise!");
			});
		}).then(function() {
			done();
		}, function(err) {
			done(err);
		});
	});

	it('should return an epc-stack error for wrong object', function(done) {
		withEPC('_error.js', function(client) {
			return client.callMethod('num_error').then(function(ret) {
				assert.ok(false, "num_error should raise an Exception.");
			},function(err) {
				//console.log("EEE "+err+"/"+err.message+"/"+err.constructor);
				assert.ok(err instanceof epc.EPCStackException);
				assert.ok(err.message.match("Infinite can not be encoded"));
				return client.callMethod('echo', new Date());
			}).then(function(ret) {
				assert.ok(false);
			}, function(err) {
				//console.log("EEE "+err+"/"+err.message+"/"+err.constructor);
				assert.ok(err instanceof epc.EPCStackException);
				assert.ok(err.message.match("Unknown object type"));
			});
		}).then(function() {
			done();
		}, function(err) {
			done(err);
		});
	});

	it('should return an epc-stack error for method missing', function(done) {
		withEPC('_error.js', function(client) {
			return client.callMethod('echo??', 1).then(function(ret) {
				assert.ok(false);
			}, function(err) {
				assert.ok(err instanceof epc.EPCStackException);
				assert.equal(err.message, "Not found the method: echo??");
			});
		}).then(function() {
			done();
		}, function(err) {
			done(err);
		});
	});

});

describe("05 Query", function() {
	it("should return a list of methods.", function(done) {
		withEPC('_methods.js', function(client) {
			return client.queryMethod().then(function(ret) {
				assert.deepEqual(ret,[
					["method1","args",""],
					["test2","a,b,c","docstring here..."],
					["test3","",""]
				]);
			});
		}).then(function() {
			done();
		}, function(err) {
			done(err);
		});
	});
});

describe('06 Echo Async', function() {

    it('should echo a message asynchronously.', function(done) {
        withEPC('_async.js', function(client) {
            return client.callMethod('echo', 'hello').then(function(ret) {
                assert.ok(ret !== null);
                assert.ok(typeof(ret) == 'string');
                assert.equal(ret, 'hello');
                return client.callMethod('echo', 12345);
            }).then(function(ret) {
                assert.ok(typeof(ret) == 'number');
                assert.equal(ret, 12345);
                return client.callMethod('echo', [1, '2', 3.2, false]);
            }).then(function(ret) {
                assert.ok(ret instanceof Array);
                assert.deepEqual(ret, [1, '2', 3.2, null]); // false -> null
            });
        }).then(function() {
            done();
        }, function(err) {
            done(err);
        });
    });

});
