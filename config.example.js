
const config = {
    /* Show debug */
    debug: true,

    /* UnrealIRCd RPC configuration */
    rpc: {
        address: "wss://ApiUSER:api-password@127.0.0.1:8003/"
    },

    /* MySQL/MariaDB configuration */
    mysql: {
        host: '127.0.0.1',
        user: '',
        password: '',
        database: '',
        table_prefix: 'unrealrpc_',

        /*
        * Refresh by periodically importing all user list and channel list data in order
        * to update reputations, vhosts, idents, etc.
        * Please note that joins/parts/quits/nick changes/num_users are handled immediately.
        * Default interval: 3 minutes (180 seconds).
        */
        saveInterval: 180
    },

    /* Configuring the IRC Framework bot */
    ircbot: {
        nick: 'JustHere',
        username: 'unrealrpc',
        gecos: 'UnrealIRCd RPC SQL Live',
        host: 'irc.example.com',
        port: '6697',
        tls: true,
        version: 'UnrealIRCd RPC SQL Live',

        /* Log in to OPER to get the JSON logging data */
        oper: {
            login: '',
            password: '',
            snomasks: '+RjnN'
        },
        
        auto_reconnect: true,

        /* 
        * Channels to join on connection.
        * For multiple channels, separated by ',' 
        */
        channels: '#opers',

        // encoding: 'utf8',
        // enable_chghost: false,
        // enable_echomessage: false,
        // sasl_disconnect_on_fail: false,

        /* Identification in SASL */
        // account: {
        //     account: 'username',
        //     password: 'account_password',
        // },

        // webirc: {
        //     password: '',
        //     username: '*',
        //     hostname: 'users.host.isp.net',
        //     ip: '1.1.1.1',
        //     options: {
        //         secure: true,
        //         'local-port': 6697,
        //         'remote-port': 21726,
        //     },
        // },
    },

    /* Activate the quiz. Don't forget to add this channel to ircbot.channels */
    trivia: {
        enable: false,
        channel: '#quiz',
        welcome_message_on_join: true
    }

}

module.exports = config;