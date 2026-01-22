try {
    require('./config');
} catch(err) {
    console.log("You need to configure the config.example.js file and rename it to config.js.");
    process.exit(1)
}
const fs = require('fs/promises');
const IrcEventHandler = require('./src/rpc/IrcEventHandler.js');
const rpcIrcEventHandler = new IrcEventHandler();
const IRCBot = require('./src/ircbot/bot.js');
const bot = new IRCBot(rpcIrcEventHandler);

(async () => {
    try {
        await fs.readFile('config.js');
        const { createTables, truncate } = require('./src/sql/tables')
        const created = await createTables();
        const truncateTables = await truncate();
        if (created && truncateTables) {
            bot.connect();
        }
    } catch (err) {
        console.log(err);
    }
})();
