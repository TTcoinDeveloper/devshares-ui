// Class which implements a JSON-RPC 2.0 server on a WebSocket
//
// The WebSocket should be prepared and connected before it is passed to the WebSocketRpcServer, as this class is not
// responsible for the underlying transport. Technically, this class could be used on any object which implements the
// WebSocket API.
class WebSocketRpcServer {

    // Create the RPC Server on the provided socket
    constructor(socket) {
        if (socket) {
            this.setSocket(socket);
        }
        this.calls = {};
        this.scopes = {};
    }

    setSocket(socket) {
        this.socket = socket;
        let s = this.socket;

        let parse = function(request) {
            if (!(_.isPlainObject(request) && request.hasOwnProperty("jsonrpc")) &&
                !(_.isArray(request) && request.length > 0 && _.isPlainObject(request[0]) &&
                  request[0].hasOwnProperty("jsonrpc")))
                // Whatever this is, it's not a JSON-RPC message. Toss it.
                return;
            
            console.log(JSON.stringify(request));
            let response;
            
            if (_.isArray(request)) {
                // Batch call
                // I can safely use Promise.all here, since promises returned by _process which are guaranteed to
                // resolve, never reject.
                // _process returns undefined for notifications, so make sure and filter those out before calling
                // Promise.all
                response = Promise.all(Array.prototype.map.call(request, function(req) {
                    return this._process(req);
                }.bind(this)).filter(function(v) { return !!v; }));
            } else {
                response = this._process(request);
            }
            
            if (response)
                response.then(response => {s.send(JSON.stringify(response));});
        }.bind(this);

        s.onmessage = function(event) {
            let message = null;
            try {
                message = JSON.parse(event.data);
            } catch(error) {
                console.error("Error parsing JSON: " + event.data);
                console.error(error);
                s.send(JSON.stringify({jsonrpc: "2.0", id: null,
                                       error: {code: -32700, message: "Invalid JSON.",
                                               data: {request: event.data, error: error}}}));
            }
            try {
                parse(message);
            } catch(error) {
                console.error("Internal error: ", error);
                s.send(JSON.stringify({jsonrpc: "2.0", id: message.id,
                                       error: {code: -32000, message: "Internal server error.", data: event.data}}));
            }
        }.bind(this);
    }

    // Expose a method through RPC. The method's name should be in name, and func should be a function with arguments
    // matching those of the API call (name and order) and returning a Promise for the result. The Promise should either
    // resolve to the result of the call, or reject. If it rejects, it may either reject with a JSON-RPC error object,
    // in which case that error object will be sent to the caller, or some other data which will be sent to the caller
    // as the data field on an error object with code 0.
    //
    // Alternatively, let name be a namespace and func be an object with function names as keys and functions as values.
    // In this instance, functions will be exposed as "namespace.func"
    expose(name, func, scope) {
        if (_.isFunction(func)) {
            // name is the method name, func is the implementation
            this.calls[name] = func;
            if (scope) this.scopes[name] = func;
        } else {
            // name is the namespace, func is {methodName: implementation, ...}
            _.forOwn(func, function(implementation, methodName) {
                let qualifiedName = [name, methodName].join('.');
                this.calls[qualifiedName] = implementation;
                if (scope) {
                    this.scopes[qualifiedName] = scope;
                }
            }.bind(this));
        }
    }

    _process(request) {
        let promiseCast = value => {
            return new Promise(resolve => {
                resolve(value);
            });
        };
        // These error codes are defined by the JSON-RPC 2.0 spec
        if (!_.isPlainObject(request) || request.jsonrpc !== "2.0") {
            let error = {code: -32600, message: "Invalid request object.", data: request};
            return promiseCast(WebSocketRpcServer._makeResponse(undefined, error));
        }
        if (!request.hasOwnProperty("method")) {
            let id = request.hasOwnProperty("id")? request.id : null;
            let error = {code: -32600, message: "No method defined in request.", data: request};
            return promiseCast(WebSocketRpcServer._makeResponse(id, error));
        }
        if (!this.calls.hasOwnProperty(request.method)) {
            let error = {code: -32601, message: "Method not found.", data: {request: request, methods: Object.keys(this.calls)}};
            return promiseCast(WebSocketRpcServer._makeResponse(request.id, error));
        }

        // Make the actual API call
        let apiCall = this.calls[request.method];
        let positionalArgs = WebSocketRpcServer._convertNamedArgumentsToPositional(apiCall, request.params);
        let callResultPromise = apiCall.apply(this.scopes[request.method], positionalArgs);
        
        if (request.hasOwnProperty("id")) {
            // Return a promise that always resolves to the data to reply with, never rejects
            return callResultPromise.then(result => {
                return WebSocketRpcServer._makeResponse(request.id, undefined, result);
            }).catch(error => {
                console.error("Error processing RPC call: ", error);
                if (_.isObject(error) && error.hasOwnProperty("code") && error.hasOwnProperty("message")) {
                    return WebSocketRpcServer._makeResponse(request.id, error);
                } else {
                    let errorObject = {code: 0, message: "Error while processing request.", data: error.toString()};
                    return WebSocketRpcServer._makeResponse(request.id, errorObject);
                }
            });
        }
    }
    static _makeResponse(id, error, result) {
        let reply = {jsonrpc: "2.0", id: id};
        if (error) {
            reply.error = error;
        } else {
            reply.result = result;
        }
        return reply;
    }
    static _convertNamedArgumentsToPositional(func, argNameToValue) {
        if (!_.isPlainObject(argNameToValue))
            // It's already positional
            return argNameToValue;
        
        let positionalArgs = (function args(func) {
            // This function adapted from https://stackoverflow.com/a/31194949/1431857
            return (func + '')
                .replace(/[/][/].*$/mg,'') // strip single-line comments
                .replace(/\s+/g, '') // strip white space
                .replace(/[/][*][^/*]*[*][/]/g, '') // strip multi-line comments
                .replace('=>', '') // remove ES6 lambda token
                .split(/\)?\{/, 1)[0].replace(/^[^(]*[(]/, '') // extract the parameters
                .replace(/=[^,]+/g, '') // strip any ES6 defaults
                .split(',').filter(Boolean); // split & filter [""]
        })(func);
        
        // Map argument names in positionalArgs to values from argNameToValue, or undefined if not present
        return positionalArgs.map(argName => {
            if (argNameToValue.hasOwnProperty(argName))
                return argNameToValue[argName];
        })
    }
}

module.exports = WebSocketRpcServer;
