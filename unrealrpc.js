try {
    require('./config');
} catch (err) {
    console.log("You need to configure the config.example.js file and rename it to config.js.");
    process.exit(1)
}
const fs = require('fs/promises');
const IRCBot = require('./src/ircbot/bot.js');
const bot = new IRCBot();

(async () => {
    try {
        await fs.readFile('config.js');
        bot.connectOrReconnect();
    } catch (err) {
        console.log(err);
    }
})();

process.on('uncaughtException', (err, origin) => {
    console.error(`${new Date().toLocaleString()} - ${parseInt(Number(new Date()) / 1000)} # Serious problem (${origin}). ${err.stack}`);
});