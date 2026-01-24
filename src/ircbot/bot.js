const config = require('./../../config');
const IRC = require('irc-framework');
const IrcEventHandler = require('./../rpc/IrcEventHandler.js');
const Trivia = require('./../trivia/Trivia');
const { createTables, truncate } = require('./../sql/tables')

class IRCBot {
    constructor() {
        this.config = {
            ...config
        };
        this.bot = null;
        this.IrcEventHandler = new IrcEventHandler();
        this.trivia = null;
    }

    MyIrcMiddleware(instance) {
        return function (client, raw_events, parsed_events) {
            parsed_events.use(theMiddleware);
            client.requestCap('unrealircd.org/json-log');
        };

        async function theMiddleware(command, event, client, next) {
            if (event.type == 'notice' && event.from_server) {
                instance.IrcEventHandler.sendJson(event);
            } else {
                //console.log('[MyMiddleware]', command, event);
            }
            next();
        }
    }

    async prepareConnection() {
        const created = await createTables();
        const truncateTables = await truncate();
        if (created && truncateTables) {
            this.connect();
        }
    }

    connect() {
        this.bot = new IRC.Client();
        this.IrcEventHandler.setBot(this);
        this.bot.use(this.MyIrcMiddleware(this));
        this.bot.connect({
            ...this.config.ircbot
        });
        this.trivia = new Trivia(this);

        this.setupEventListeners();
    }

    setupEventListeners() {
        if (!this.bot) return;

        this.bot.on('registered', this.handleRegistered.bind(this));
        this.bot.on('close', this.handleClose.bind(this));

        if (config.trivia.enable) {
            this.bot.on('message', this.handleMessage.bind(this));
            if (config.trivia.welcome_message_on_join)
                this.bot.on('join', this.handleJoin.bind(this));
        }
        //this.bot.on('whois', this.handleWhois.bind(this));
        //this.bot.on('userlist', this.handleUserlist.bind(this));
        //this.bot.on('part', this.handlePart.bind(this));
        //this.bot.on('raw', this.handleRaw.bind(this));
    }

    async handleRegistered() {
        console.log(`Connected to ${this.config.ircbot.host} as ${this.config.ircbot.nick}!`);
        if (this.config?.ircbot?.oper?.login && this.config?.ircbot?.oper?.password) {
            this.bot.raw(`OPER ${this.config.ircbot.oper.login} ${this.config.ircbot.oper.password}`);
            this.bot.raw(`MODE ${this.config.ircbot.nick} +s ${this.config.ircbot.oper.snomasks}`);
        }
        for (const channel of this.config.ircbot.channels.split(',')) {
            this.joinChannel(channel);
        }

        this.IrcEventHandler.startInterval();
    }

    handleClose() {
        console.log('Connection closed');
    }

    handleRaw(event) {
        console.log(event);
    }

    handleWhois(event) {
        console.log('WHOIS result:', event);
    }

    handleMessage(event) {
        //console.log(`<${event.nick}@${event.target}> ${event.message}`);

        if (/^#/.test(event.target) && config.trivia.enable && config.trivia.channel.toLowerCase() === event.target.toLowerCase()) {
            this.trivia.messageHandle(event);
        }

    }

    handleJoin(event) {
        //console.log(`${event.nick} joined ${event.channel}`);
        if (config.trivia.enable && config.trivia.channel.toLowerCase() === event.channel.toLowerCase()) {
            this.trivia.joinHandle(event);
        }
    }

    handleUserlist(event) {
        console.log(`Users in ${event.channel}:`, event.users.length);
    }

    handlePart(event) {
        console.log(`${event.nick} left ${event.channel}`);
    }

    joinChannel(channel) {
        if (this.bot) {
            console.log(`Joining ${channel}`);
            this.bot.join(channel);
        }
    }

    disconnect() {
        if (this.bot) {
            console.log('Disconnecting...');
            this.bot.quit();
            this.bot = null;
        }
    }

    isConnected() {
        return this.bot !== null;
    }
}

module.exports = IRCBot;