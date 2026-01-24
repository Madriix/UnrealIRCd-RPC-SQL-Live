const config = require('./../../config');
const db = require("./db");

module.exports = { createTables, truncate };

async function createTables() {
    const tablePrefix = config.mysql.table_prefix;
    const usersTable = tablePrefix + 'users';
    const topCountriesTable = tablePrefix + 'top_countries';

    try {
        await db.execute(`DROP TABLE IF EXISTS \`${usersTable}\``);
        await db.execute(`
                CREATE TABLE \`${usersTable}\` (
                    \`id_user\` VARCHAR(255) NOT NULL,
                    \`name\` VARCHAR(255) NOT NULL,
                    \`username\` VARCHAR(255) NOT NULL,
                    \`realname\` VARCHAR(255) NOT NULL,
                    \`vhost\` VARCHAR(255) NOT NULL,
                    \`account\` VARCHAR(255) NOT NULL,
                    \`reputation\` INT UNSIGNED NOT NULL DEFAULT 0,
                    \`hostname\` VARCHAR(255) NOT NULL,
                    \`ip\` VARCHAR(45) NOT NULL,
                    \`country_code\` CHAR(2) NOT NULL,
                    \`asn\` VARCHAR(10) NOT NULL,
                    \`asname\` VARCHAR(255) NOT NULL,
                    \`connected_since\` DATETIME NOT NULL,
                    \`idle_since\` DATETIME NOT NULL,
                    \`idle\` INT UNSIGNED NOT NULL DEFAULT 0,
                    \`modes\` VARCHAR(255) NOT NULL,
                    \`channels\` TEXT NOT NULL,
                    \`security_groups\` TEXT NOT NULL,
                    \`away_reason\` TEXT NOT NULL,
                    \`away_since\` TEXT NOT NULL,
                    PRIMARY KEY (\`id_user\`),
                    UNIQUE KEY \`unique_name\` (\`name\`)
                ) 
                ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 
                COLLATE=utf8mb4_general_ci;
            `);

        await db.execute(`DROP TABLE IF EXISTS \`${topCountriesTable}\``);
        await db.execute(`
                CREATE TABLE \`${topCountriesTable}\` (
                    \`country_code\` CHAR(2) NOT NULL,
                    \`users\` INT UNSIGNED NOT NULL DEFAULT 0,
                    PRIMARY KEY (\`country_code\`)
                ) 
                ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 
                COLLATE=utf8mb4_general_ci;
            `);

        return true;
    } catch (error) {
        console.error("Erreur lors de la création des tables:", error);
        return false;
    }
}

async function truncate() {
    const tablePrefix = config.mysql.table_prefix;
    const usersTable = tablePrefix + 'users';

    await db.execute(`TRUNCATE TABLE ${usersTable}`);

    return true
}