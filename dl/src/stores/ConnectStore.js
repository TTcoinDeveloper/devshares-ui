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
            getAssetBySymbol: this.getAssetBySymbol,
            getAllAssets: this.getAllAssets,
            getAccountByName: this.getAccountByName,
            getAccountBalances: this.getAccountBalances,
            getAccountHistory: this.getAccountHistory,
            getAccountHistoryByOpCode: this.getAccountHistoryByOpCode,
            getMyAccounts: this.getMyAccounts,
            isConnected: this.isConnected,
            _registerApi: this._registerApi
        });
    }

    connect(connection_string) {
        if (this.ws_rpc) return; // already connected
        console.log(`connecting to ${connection_string}`);
        this.ws_rpc = new WebSocketRpc();
        this._registerApi();
        setTimeout(function() {
            this.ws_rpc.setSocket(new WebSocketClient(connection_string));
        }.bind(this), 5000);
        return this.ws_rpc;
    }
    
    isConnected() {
        return this.ws_rpc;
    }

    close() {
        this.ws_rpc.close();
        this.ws_rpc = null
    }

    getObjectById(objectId) {
        return Apis.instance().db_api().exec("get_objects", [[id]]);
    }
    
    getAssetBySymbol(assetSymbol) {
        return Apis.instance().db_api().exec("lookup_asset_symbols", [[symbol]]);
    }

    getAllAssets() {
        let assets = [];
        let dbApi = Apis.instance().db_api();
        return new Promise(resolve => {
            let fetchMore = lowerBound => {
                dbApi.exec("list_assets", [lowerBound, 100]).then(list => {
                    assets = assets.concat(list);
                    if (list.length >= 100) {
                        fetchMore(list[list.length - 1].symbol);
                    } else {
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
        }).then(assets => {
            // Look up issuer accounts
            return dbApi.exec("get_accounts", [assets.map(asset => { return asset.issuer; })]);
        }).then(accounts => {
            // Replace issuer IDs with account names
            // Zip function taken from http://stackoverflow.com/a/10284006/1431857
            let zip= rows=>rows[0].map((_,c)=>rows.map(row=>row[c]));
            return zip([assets, accounts]).map(assetAccount => {
                assetAccount[0].issuer = assetAccount[1].name;
                return assetAccount[0];
            });
        }).catch(error => {console.log(error); throw error;});
    }
    
    getAccountByName(accountName) {
        let db = Apis.instance().db_api();
        return db.exec("get_account_by_name", [accountName]);
    }

    getAccountBalances(accountName) {
        let db = Apis.instance().db_api();
        return this.getAccountByName(accountName).then(account => {
            return db.exec("get_account_balances", [account.id, []]);
        }).then(balances => {
            return balances.map(balance => {
                return {amount: balance.amount, type: balance.asset_id};
            });
        });
    }

    getAccountHistory(accountName) {
        let history = [];
        let dbApi = Apis.instance().db_api();
        let historyApi = Apis.instance().history_api();

        return dbApi.exec("get_account_by_name", [accountName]).then(account => {
            return new Promise(resolve => {
                let fetchMore = lowerBound => {
                    historyApi.exec("get_account_history", [account.id, "1.11.0", 100, lowerBound]).then(list => {
                        history = history.concat(list);
                        if (list.length >= 100) {
                            fetchMore(list[list.length - 1].id);
                        } else {
                            resolve(_.uniq(history.map(historyObject => {
                                return {id: historyObject.id, opCode: historyObject.op[0]};
                            })));
                        }
                    });
                };
                fetchMore("1.11.0");
            });
        });
    }

    getAccountHistoryByOpCode(accountName, opCode) {
        return this.getAccountHistory(accountName).then(history => {
            return history.filter(operation => {return operation.opCode === opCode;})
                          .map(operation => {return operation.id;});
        });
    }

    getMyAccounts() {
        return new Promise(resolve=>{resolve(AccountStore.getMyAccounts());});
    }

    _registerApi() {
        this.ws_rpc.expose('blockchain', {
            getObjectById: this.getObjectById,
            getAssetBySymbol: this.getAssetBySymbol,
            getAllAssets: this.getAllAssets,
            getAccountByName: this.getAccountByName,
            getAccountBalances: this.getAccountBalances,
            getAccountHistory: this.getAccountHistory,
            getAccountHistoryByOpCode: this.getAccountHistoryByOpCode
        }, this);
        this.ws_rpc.expose('wallet', {
            getMyAccounts: this.getMyAccounts
        }, this);
    }

}

module.exports = alt.createStore(ConnectionStore, 'ConnectionStore');
