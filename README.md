<h1>UnrealIRCd RPC → SQL Live</h1>

## About ##

New project in the process of being created. Its purpose is to enable the live recording of UnrealIRCd JSON-RPC data into a MySQL/MariaDB database, additionally aided by a bot connected to the IRC server.

## Features ##

:heavy_check_mark: UnrealIRCd Real-Time RPC in MySQL

:heavy_check_mark: Works with a robot connected to IRC

:heavy_check_mark: A trivia quiz is built into the bot (without a saved database)

## Technologies ##

The following tools were used in this project:

- [Node.js](https://nodejs.org/en/)
- [irc-framework](https://github.com/kiwiirc/irc-framework)
- [unrealircd-rpc-node](https://github.com/Madriix/unrealircd-rpc-node)

## Starting ##

```bash
# Clone this project
$ git clone https://github.com/madriix/unrealircd-rpc-sql-live

# Access
$ cd unrealircd-rpc-sql-live

# Install dependencies
$ npm install

# Run the project
$ npm start
```

## Configuration ##
Configure `config.example.js`, then rename it to `config.js`

## Expected result ##
The robot records the list of JSON-RPC users in real time.

Currently, three tables are updated in real time:

- `unrealrpc_top_countries`
- `unrealrpc_channels`
- `unrealrpc_users`

Some data is updated every x seconds (`config.mysql.saveInterval`), such as the reputation, dates, vhosts, modes etc... in the `unrealrpc_users` and `unrealrpc_channels` tables.


This project is a test; I'm not sure if I'll continue.

## License ##

This project is under license from MIT.


&#xa0;

<a href="#top">Back to top</a>
