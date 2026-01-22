const config = require('./../../config');
const { UnrealIRCdRpc, unrealircdRpc } = require('unrealircd-rpc-node');
const PQueue = require('p-queue').default;
const { execute } = require("./../sql/db");
const top_countries = require('./../sql/top_countries')
const UnrealIRCdChannels = require('./../sql/channels')
const Logger = require('./../logger/Logger');
const logger = new Logger();

class IrcEventHandler {

    constructor() {
        UnrealIRCdRpc.address = config.rpc.address;
        this.rpc = unrealircdRpc;
        this.unrealircd_channels = new UnrealIRCdChannels();
        this.usersCount = 0;
        this._users = new Map();

        // File d'attente unique → pas de conflits DB
        this.queue = new PQueue({ concurrency: 1 });
    }

    /* -------------------------------------------------- */
    /* Utils                                              */
    /* -------------------------------------------------- */

    mapUser(user) {
        const connected = user.connected_since ? new Date(user.connected_since) : null;
        const idleSince = user.idle_since ? new Date(user.idle_since) : null;

        return [
            user.id || '',
            user.name || '',
            user.user?.username || '',
            user.user?.realname || '',
            user.user?.vhost || '',
            user.user?.account || '',
            user.user?.reputation || 0,
            user.hostname || '',
            user.ip || '',
            user.geoip?.country_code || '',
            user.geoip?.asn || '',
            user.geoip?.asname || '',
            user.connected_since || null,
            user.idle_since || null,
            connected && idleSince
                ? Math.floor((idleSince - connected) / 1000)
                : 0,
            user.user?.modes || '',
            user.user?.channels.join(',') || '',
            user.user?.['security-groups']
                ? Object.values(user.user['security-groups']).join(',')
                : '',
            user.user?.away_reason || '',
            user.user?.away_since || ''
        ];
    }

    enqueue(fn) {
        return this.queue.add(fn);
    }

    /* -------------------------------------------------- */
    /* Lancement du sync périodique                       */
    /* -------------------------------------------------- */

    startInterval() {
        const intervalMs = config.mysql.saveInterval * 1000;

        const run = () => {
            return this.queue.add(async () => {
                console.log('[QUEUE] unrealircd_users scheduled');
                await this.unrealircd_channels.init();
                await this.unrealircd_users();
            });
        };

        // lancement immédiat
        run();

        setInterval(run, intervalMs);
    }


    /* -------------------------------------------------- */
    /* Full sync users (batch SQL)                        */
    /* -------------------------------------------------- */

    async unrealircd_users() {
        const users = await this.rpc.listUsers(4);
        users.forEach(user => {
            this._users.set(user.name, user);
        });
        this.usersCount = users.length;
        //console.log('[SYNC] users count:', this.usersCount);
        process.stdout.write(`\r[SYNC] users count: \x1b[33m${this.usersCount}\x1b[0m\r`);

        if (!users.length) return;

        const usersTable = config.mysql.table_prefix + 'users';
        console.log(`[SYNC] ${usersTable} START`);

        const placeholders = [];
        const values = [];

        const usersArray = Array.from(this._users.values());

        for (const user of usersArray) {
            placeholders.push('(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
            values.push(...this.mapUser(user));
        }

        const sql = `
            INSERT INTO ${usersTable}
            (id_user, name, username, realname, vhost, account, reputation,
             hostname, ip, country_code, asn, asname, connected_since,
             idle_since, idle, modes, channels, security_groups,
             away_reason, away_since)
            VALUES ${placeholders.join(',')}
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                username = VALUES(username),
                realname = VALUES(realname),
                vhost= VALUES(vhost),
                account= VALUES(account),
                reputation= VALUES(reputation),
                connected_since= VALUES(connected_since),
                idle_since= VALUES(idle_since),
                modes= VALUES(modes),
                security_groups= VALUES(security_groups),
                channels = VALUES(channels),
                idle = VALUES(idle),
                country_code = VALUES(country_code),
                away_reason = VALUES(away_reason),
                away_since = VALUES(away_since)
        `;

        await execute(sql, values);

        const countriesTable = config.mysql.table_prefix + 'top_countries';
        console.log(`[SYNC] ${countriesTable} START`);
        await this.rebuildTopCountries();
    }

    /* -------------------------------------------------- */
    /* Recalcul top countries                             */
    /* -------------------------------------------------- */

    async rebuildTopCountries() {
        await top_countries();
    }



    /* -------------------------------------------------- */
    /* IRC JSON events                                    */
    /* -------------------------------------------------- */

    async sendJson(event) {
        if (!event?.tags?.['unrealircd.org/json-log']) return;

        const data = JSON.parse(event.tags['unrealircd.org/json-log']);

        switch (data.event_id) {
            case 'LOCAL_CLIENT_CONNECT':
            case 'REMOTE_CLIENT_CONNECT':
                return this.enqueue(() =>
                    this.clientUpsert(data, true, 'connect')
                );

            case 'LOCAL_CLIENT_DISCONNECT':
            case 'REMOTE_CLIENT_DISCONNECT':
                return this.enqueue(() =>
                    this.clientDelete(data)
                );

            case 'LOCAL_NICK_CHANGE':
            case 'REMOTE_NICK_CHANGE':
                return this.enqueue(() =>
                    this.nickChange(data)
                );
            case 'FORCED_NICK_CHANGE':
                return this.enqueue(() =>
                    this.forcedNickChange(data)
                );
            case 'LOCAL_CLIENT_JOIN':
            case 'REMOTE_CLIENT_JOIN':
                return this.enqueue(() =>
                    this.clientUpsert(data, true, 'join')
                );
            case 'LOCAL_CLIENT_PART':
            case 'REMOTE_CLIENT_PART':
                return this.enqueue(() =>
                    this.clientUpsert(data, null, 'part')
                );
            case 'LOCAL_CLIENT_KICK':
            case 'REMOTE_CLIENT_KICK':
                return this.enqueue(() =>
                    this.clientUpsert(data, null, 'kick')
                );
            default:
            //console.log(data)
        }
    }

    /* -------------------------------------------------- */
    /* Ops DB incrémentales                               */
    /* -------------------------------------------------- */

    async clientUpsert(user, withTopCountries = null, target = null) {
        if (target == 'connect') {
            this._users.set(user.client.name, user.client)
            this.usersCount++;
            //console.log('[SYNC] users count:', this.usersCount);
            logger.debug(`\x1b[32m[Connect] ${user.client.name}!${user.client.user.username}@${user.client.ip} has connected\x1b[0m on server IRC. User count: \x1b[33m${this.usersCount}\x1b[0m`);
            process.stdout.write(`\r[SYNC] users count: \x1b[33m${this.usersCount}\x1b[0m\r`);
        }

        const usersTable = config.mysql.table_prefix + 'users';

        const sql = `
            INSERT INTO ${usersTable}
            (id_user, name, username, realname, vhost, account, reputation,
             hostname, ip, country_code, asn, asname, connected_since,
             idle_since, idle, modes, channels, security_groups,
             away_reason, away_since)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON DUPLICATE KEY UPDATE
                name = VALUES(name),
                channels = VALUES(channels),
                idle = VALUES(idle),
                country_code = VALUES(country_code)
        `;

        await execute(sql, this.mapUser(user.client));

        if (withTopCountries)
            await this.rebuildTopCountries();

        if (target == 'join') {
            await this.unrealircd_channels.insertChannel(user.channel);
            logger.debug(`\x1b[33m${user.client.name}\x1b[0m has joined the \x1b[33m${user.channel.name}\x1b[0m channel (num users: \x1b[33m${user.channel.num_users}\x1b[0m)`);
        }
        else if (target == 'part') {
            await this.unrealircd_channels.deleteChannel(user.channel);
            logger.debug(`\x1b[33m${user.client.name}\x1b[0m has left the \x1b[33m${user.channel.name}\x1b[0m channel (num users: \x1b[33m${user.channel.num_users - 1}\x1b[0m)`);
        }
        else if (target == 'kick') {
            await this.unrealircd_channels.deleteChannel(user.channel);
            logger.debug(`\x1b[33m${user.client.name}\x1b[0m was kicked from the \x1b[33m${user.channel.name}\x1b[0m channel (num users: \x1b[33m${user.channel.num_users - 1}\x1b[0m)`);
        }
    }

    async clientDelete(user) {
        this._users.delete(user.client.name)
        this.usersCount--;
        //console.log('[SYNC] users count:', this.usersCount);
        logger.debug(`\x1b[31m[Disconnect] ${user.client.name}!${user.client.user.username}@${user.client.ip} has disconnected\x1b[0m on server IRC. User count: \x1b[33m${this.usersCount}\x1b[0m`);
        process.stdout.write(`\r[SYNC] users count: \x1b[33m${this.usersCount}\x1b[0m\r`);

        const channels = user.client.user.channels;
        for (const channel of channels) {
            const num_users = this.unrealircd_channels.updateCountChannel(channel, 1, '-')
            logger.debug(`   -The \x1b[33m${channel}\x1b[0m channel now has \x1b[33m${num_users}\x1b[0m users`)
        }

        const usersTable = config.mysql.table_prefix + 'users';
        await execute(
            `DELETE FROM ${usersTable} WHERE id_user = ?`,
            [user.client.id]
        );

        await this.rebuildTopCountries();


    }

    async nickChange(user) {

        logger.debug(`\x1b[32m[Nick change] ${user.client.name} changes his nickname to ${user.new_nick}\x1b[0m`);

        this._users.delete(user.client.name);
        this._users.set(user.new_nick, user);

        const usersTable = config.mysql.table_prefix + 'users';
        await execute(
            `UPDATE ${usersTable} SET name = ? WHERE name = ? LIMIT 1`,
            [user.new_nick, user.client.name]
        );
    }

    async forcedNickChange(user) {

        logger.debug(`\x1b[32m[Forced nick change] ${user.client.name} changes his nickname to ${user.new_nick_name}\x1b[0m`);

        this._users.delete(user.client.name);
        this._users.set(user.new_nick_name, user);

        const usersTable = config.mysql.table_prefix + 'users';
        await execute(
            `UPDATE ${usersTable} SET name = ? WHERE name = ? LIMIT 1`,
            [user.new_nick_name, user.client.name]
        );
    }

}

module.exports = IrcEventHandler;
