const config = require('./../../config');
const mysql = require('mysql2/promise');
const EventEmitter = require('events');

const dbEvents = new EventEmitter();

let mysqlOnline = true;
let pool = null;
let pingInterval = null;

const dbConfig = {
    host: config.mysql.host,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: true,
    connectTimeout: 10000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

async function createPool() {
    try {
        console.log(`Tentative de connexion MySQL à ${dbConfig.host}:3306...`);

        pool = mysql.createPool(dbConfig);

        // Tester la connexion immédiatement
        const connection = await pool.getConnection();
        console.log('✅ Connexion MySQL établie avec succès');
        await connection.ping();
        connection.release();

        mysqlOnline = true;
        dbEvents.emit('up');

        pool.on('error', (err) => {
            console.error('Erreur MySQL pool:', err.message);
            handleMysqlError(err);
        });

        startPing();

    } catch (err) {
        console.error('Échec de connexion MySQL:', err.message);
        mysqlOnline = false;
        dbEvents.emit('down', err);
    }
}

async function execute(sql, values) {
    if (!mysqlOnline || !pool) {
        throw new Error('MySQL non disponible');
    }

    try {
        return await pool.execute(sql, values);
    } catch (err) {
        console.error('Erreur execute:', err.message);
        handleMysqlError(err);
        throw err;
    }
}

async function query(sql, values) {
    if (!mysqlOnline || !pool) {
        throw new Error('MySQL non disponible');
    }

    try {
        return await pool.query(sql, values);
    } catch (err) {
        console.error('Erreur execute:', err.message);
        handleMysqlError(err);
        throw err;
    }
}

function handleMysqlError(err) {
    const fatalCodes = [
        'ECONNREFUSED',
        'PROTOCOL_CONNECTION_LOST',
        'ETIMEDOUT',
        'EHOSTUNREACH',
        'ENOTFOUND'
    ];

    if (fatalCodes.includes(err.code)) {
        console.error(`Erreur fatale MySQL (${err.code}):`, err.message);

        if (mysqlOnline) {
            mysqlOnline = false;
            dbEvents.emit('down', err);

            // Détruire le pool existant
            /*if (pool) {
                try {
                    pool.end();
                } catch (_) { }
                pool = null;
            }*/
        }
    }
}

function startPing(intervalMs = 10000) {
    if (pingInterval) clearInterval(pingInterval);

    pingInterval = setInterval(async () => {
        if (!pool) return;

        try {
            const connection = await pool.getConnection();
            await connection.ping();
            connection.release();

            if (!mysqlOnline) {
                mysqlOnline = true;
                console.log('MySQL reconnecté');
                dbEvents.emit('up');
            }
        } catch (err) {
            if (mysqlOnline) {
                console.error('Ping MySQL échoué:', err.message);
                mysqlOnline = false;
                dbEvents.emit('down', err);
            }
        }
    }, intervalMs);
}

function stopPing() {
    if (pingInterval) {
        clearInterval(pingInterval);
        pingInterval = null;
    }
}

// Initialisation
createPool();

module.exports = {
    execute,
    query,
    isOnline: () => mysqlOnline,
    events: dbEvents,
    startPing,
    stopPing,
    getConnection: async () => {
        if (!mysqlOnline) throw new Error('MySQL non disponible');
        return pool.getConnection();
    }
};