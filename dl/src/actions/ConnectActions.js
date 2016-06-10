var alt = require("../alt-instance");

class ConnectActions {
    connect(connection_string) {
        this.dispatch(connection_string);
    }
}

module.exports = alt.createActions(ConnectActions);
