const config = require('./../../config');
const db = require("./db");

module.exports = top_countries;

async function top_countries() {
    const usersTable = config.mysql.table_prefix + 'users';
    const countriesTable = config.mysql.table_prefix + 'top_countries';

    await db.execute('START TRANSACTION');

    try {

        await db.execute(`DROP TEMPORARY TABLE IF EXISTS tmp_country_counts`);

        await db.execute(`
            CREATE TEMPORARY TABLE tmp_country_counts (
                country_code VARCHAR(10) PRIMARY KEY,
                users INT NOT NULL
            )
        `);

        await db.execute(`
            INSERT INTO tmp_country_counts (country_code, users)
            SELECT country_code, COUNT(*) AS users
            FROM ${usersTable}
            WHERE country_code != ''
            GROUP BY country_code
        `);

        await db.execute(`
            UPDATE ${countriesTable} tc
            JOIN tmp_country_counts t ON t.country_code = tc.country_code
            SET tc.users = t.users
        `);

        await db.execute(`
            INSERT INTO ${countriesTable} (country_code, users)
            SELECT t.country_code, t.users
            FROM tmp_country_counts t
            LEFT JOIN ${countriesTable} tc ON tc.country_code = t.country_code
            WHERE tc.country_code IS NULL
        `);

        await db.execute(`
            DELETE FROM ${countriesTable}
            WHERE country_code NOT IN (
                SELECT country_code FROM tmp_country_counts
            )
        `);

        await db.execute('COMMIT');
    } catch (err) {
        await db.execute('ROLLBACK');
        throw err;
    }
}
