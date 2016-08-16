import React from "react";
import NotificationActions from "actions/NotificationActions";
import ConnectStore from "stores/ConnectStore.js"
import ConnectActions from "actions/ConnectActions.js"

class ConnectWallet extends React.Component {

    constructor(props) {
        super(props);
        this.state = {};
        let btsUrl = props.params.data;
        let host = btsUrl.replace("web+bts:", "").replace("/", ":");
        ConnectStore.connect("ws://" + host);
    }

    componentDidMount() {
    }

    render() {
        let data = "! Not connected !";
        if (ConnectStore.isConnected()) {
            data = "Connected";
        }

        return (
            <div className="grid-block vertical">
                <div className="grid-content">
                    <div className="content-block invoice">
                        <br/>
                        <h3>Connect</h3>
                        <p>{data}</p>
                    </div>
                </div>
            </div>
        );
    }
}

export default ConnectWallet;
