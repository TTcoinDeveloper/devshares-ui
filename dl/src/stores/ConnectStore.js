var alt = require("../alt-instance");
var WebSocketClient = require("ReconnectingWebSocket");
var WebSocketRpc = require("rpc_api/WebSocketRpcServer");
var ConnectActions = require('actions/ConnectActions');
var AccountStore = require("stores/AccountStore");

class ConnectionStore {

    constructor() {
        this.errorMessage = null;
        this.ws_rpc = null;

        this.bindListeners({
            connect: ConnectActions.CONNECT
        });

        this.exportPublicMethods({
            connect: this.connect,
            getObjectById: this.getObjectById,
            getAllAssets: this.getAllAssets,
            getMyAccounts: this.getMyAccounts,
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

    getObjectById(id) {
        return Apis.instance().db_api().exec("get_objects", [[id]]);
    }

    getAllAssets() {
        let assets = [];
        let dbApi = Apis.instance().db_api();
        return new Promise((resolve, reject) => {
            let fetchMore = lowerBound => {
                dbApi.exec("list_assets", [lowerBound, 100]).then(list => {
                    console.log(list.length);
                    assets = assets.concat(list);
                    if (list.length >= 100) {
                        fetchMore(list[list.length - 1].symbol);
                    } else {
                        console.log(assets.length);
                        resolve(_.uniq(assets.map(asset => {
                            return {
                                id: asset.id, symbol: asset.symbol,
                                precision: asset.precision, issuer: asset.issuer
                            };
                        })));
                    }
                });
            };
            fetchMore("");
        });
    }
    
    getMyAccounts() {
        console.log(JSON.stringify(AccountStore.getMyAccounts()));
        return new Promise(resolve => {resolve(AccountStore.getMyAccounts());});
    }

    _registerApi() {
        this.ws_rpc.expose('blockchain', {
            getObjectById: this.getObjectById,
            getAllAssets: this.getAllAssets
        }, this);
        this.ws_rpc.expose('wallet', {
            getMyAccounts: this.getMyAccounts
        }, this);
    }

}

module.exports = alt.createStore(ConnectionStore, 'ConnectionStore');
