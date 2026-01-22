// db.js
const config = require('./../../config');
const mysql = require('mysql2/promise')

let _pool // one pool per app

function pool() {
    if (_pool) return _pool

    _pool = mysql.createPool({
        host: config.mysql.host,
        user: config.mysql.user,
        password: config.mysql.password,
        database: config.mysql.database,
        waitForConnections: true,
        connectionLimit: 20,
        queueLimit: 0,
        namedPlaceholders: true
    });

    return _pool
}

async function query(sql, values) {
    return await pool().query(sql, values);
}

async function execute(sql, values) {
    return await pool().execute(sql, values);
}

async function getConnection() {
    return await pool().getConnection();
}

async function transaction(callback) {
    const connection = await getConnection();
    try {
        await connection.beginTransaction();
        const result = await callback(connection);
        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release(); // IMPORTANT : rendre la connexion au pool
    }
}

module.exports = {
    query,
    execute,
    getConnection,
    transaction
}