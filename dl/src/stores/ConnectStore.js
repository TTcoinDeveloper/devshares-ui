var alt = require("../alt-instance");
var WebSocketClient = require("ReconnectingWebSocket");
var WebSocketRpc = require("rpc_api/WebSocketRpcServer");
var ConnectActions = require('actions/ConnectActions');

class ConnectionStore {

    constructor() {
        this.errorMessage = null;
        this.ws_rpc = null;

        this.bindListeners({
            connect: ConnectActions.CONNECT
        });

        this.exportPublicMethods({
            connect: this.connect,
            getInfo: this.getInfo,
            exec: this.exec,
            isConnected: this.isConnected,
            _registerApi: this._registerApi
        });
    }

    connect(connection_string) {
        if (this.ws_rpc) return; // already connected
        console.log(`connecting to ${connection_string}`);
        this.ws_rpc = new WebSocketRpc();
        this._registerApi();
        this.ws_rpc.setSocket(new WebSocketClient(connection_string));
        return this.ws_rpc;
    }
    
    isConnected() {
        return this.ws_rpc;
    }

    exec(method, params) {
        return this.ws_rpc.connect_promise.then(() => {
            return this.ws_rpc.call([1, method, params])
                .catch(error => {
                    console.log("!!! ConnectInstances error: ", method, params, error);
                    throw error;
                })
        });
    }

    close() {
        this.ws_rpc.close();
        this.ws_rpc = null
    }

    getInfo(a, b) {
        return new Promise(resolve => {resolve("This is the info: a is " + a + ", and b is " + b);});
    }

    _registerApi() {
        this.ws_rpc.expose('getInfo', this.getInfo, this);
    }

}

module.exports = alt.createStore(ConnectionStore, 'ConnectionStore');
