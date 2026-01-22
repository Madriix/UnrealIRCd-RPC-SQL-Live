const config = require('./../../config');
const { execute } = require("./db");
const { UnrealIRCdRpc, unrealircdRpc } = require('unrealircd-rpc-node');
const Logger = require('./../logger/Logger');
const logger = new Logger();

module.exports = class UnrealIRCdChannels {
    constructor() {
        UnrealIRCdRpc.address = config.rpc.address;
        this.rpc = unrealircdRpc;
        this.channels = [];
        this.table = `${config.mysql.table_prefix}channels`;
    }

    async init() {
        this.channels = await this.rpc.listChannels();
        await this.main();
    }

    /* =========================
       GESTION DE LA TABLE
    ========================= */

    async tableExists() {
        try {
            await execute(`SELECT 1 FROM \`${this.table}\` LIMIT 1`);
            return true;
        } catch (error) {
            if (error.code !== 'ER_NO_SUCH_TABLE') {
                logger.debug(`⚠️ Erreur lors de la vérification de la table: ${error.message}`);
            }
            return false;
        }
    }

    /**
     * Analyse tous les canaux pour extraire toutes les colonnes possibles
     */
    getAllColumnsFromChannels() {
        if (!this.channels.length) {
            return new Set();
        }

        // Utiliser un Set pour éviter les doublons
        const allColumns = new Set();

        // Parcourir tous les canaux pour collecter toutes les clés
        for (const channel of this.channels) {
            if (channel && typeof channel === 'object') {
                Object.keys(channel).forEach(key => {
                    allColumns.add(key);
                });
            }
        }

        logger.debug(`${allColumns.size} columns identified among ${this.channels.length} channels`);
        if (allColumns.size > 0) {
            logger.debug(`Columns: ${Array.from(allColumns).join(', ')}`);
        }

        return allColumns;
    }

    async createTable() {
        if (!this.channels.length) {
            logger.debug('⚠️ Aucun canal disponible pour créer la table');
            return;
        }

        // Récupérer TOUTES les colonnes de TOUS les canaux
        const allColumns = this.getAllColumnsFromChannels();

        if (allColumns.size === 0) {
            logger.debug('❌ No columns identified in the channel data');
            return;
        }

        // Créer les colonnes SQL
        const columns = Array.from(allColumns)
            .map(key => `\`${key}\` TEXT`)
            .join(',\n                ');

        const sql = `
            CREATE TABLE IF NOT EXISTS \`${this.table}\` (
                \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
                ${columns},
                \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB
            DEFAULT CHARSET=utf8mb4
            COLLATE=utf8mb4_unicode_ci;
        `;

        await execute(sql);
        logger.debug(`✅ Table ${this.table} created with ${allColumns.size} columns`);
    }

    async recreateTable() {
        try {
            await execute(`DROP TABLE IF EXISTS \`${this.table}\``);
            logger.debug(` Table \`${this.table}\` supprimée`);
            await this.createTable();
        } catch (error) {
            logger.debug(`❌ Erreur lors de la recréation de la table: ${error.message}`);
            throw error;
        }
    }

    async ensureTable() {
        const exists = await this.tableExists();
        if (!exists) {
            await this.createTable();
        } else {
            // Vérifier si le schéma correspond
            await this.verifyTableSchema();
        }
    }

    /**
     * Vérifie si la table existante a les bonnes colonnes
     */
    async verifyTableSchema() {
        try {
            const allColumns = this.getAllColumnsFromChannels();
            if (allColumns.size === 0) return;

            // Récupérer les colonnes existantes de la table
            const result = await execute(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = ?
            `, [this.table]);

            const existingColumns = new Set(result.map(row => row.COLUMN_NAME));

            // Vérifier les colonnes manquantes
            const missingColumns = Array.from(allColumns).filter(
                col => !existingColumns.has(col) && col !== 'id' &&
                    col !== 'created_at' && col !== 'updated_at'
            );

            if (missingColumns.length > 0) {
                logger.debug(`⚠️ ${missingColumns.length} columns missing from the table: ${missingColumns.join(', ')}`);
                logger.debug('Adding the missing columns...');

                for (const column of missingColumns) {
                    try {
                        await execute(`ALTER TABLE \`${this.table}\` ADD COLUMN \`${column}\` TEXT`);
                        logger.debug(` ➕ Column ${column} added`);
                    } catch (alterError) {
                        logger.debug(`   ❌ Unable to add the column \`${column}\`: ${alterError.message}`);
                    }
                }
            }
        } catch (error) {
            logger.debug(`⚠️ Impossible de vérifier le schéma: ${error.message}`);
        }
    }

    /* =========================
       GESTION DES DONNÉES
    ========================= */

    async truncateTable() {
        try {
            await execute(`TRUNCATE TABLE \`${this.table}\``);
            logger.debug(`Table ${this.table} cleared`);
        } catch (error) {
            logger.debug(`❌ Error while clearing the table: ${error.message}`);
            throw error;
        }
    }

    /**
     * Normalise un canal pour qu'il ait toutes les colonnes attendues
     */
    normalizeChannel(channel, allColumns) {
        const normalized = {};

        // S'assurer que toutes les colonnes sont présentes
        for (const column of allColumns) {
            normalized[column] = channel[column] !== undefined ? channel[column] : null;
        }

        return normalized;
    }

    async insertChannels() {
        if (!this.channels.length) {
            logger.debug('⚠️ No channels to insert');
            return;
        }

        console.log(`[SYNC] ${this.table} START`);

        // Obtenir toutes les colonnes nécessaires
        const allColumns = this.getAllColumnsFromChannels();
        const columnsArray = Array.from(allColumns);

        if (columnsArray.length === 0) {
            logger.debug('❌ No columns available for insertion');
            return;
        }

        const columns = columnsArray.map(k => `\`${k}\``).join(', ');
        const batchSize = 50;

        const updateClause = columns.split(',')
            .map(col => `${col} = VALUES(${col})`)
            .join(', ');

        for (let i = 0; i < this.channels.length; i += batchSize) {
            const batch = this.channels.slice(i, i + batchSize);

            // Normaliser tous les canaux du batch
            const normalizedBatch = batch.map(channel =>
                this.normalizeChannel(channel, allColumns)
            );

            // Construction de la requête batch
            const placeholders = normalizedBatch.map(() =>
                `(${columnsArray.map(() => '?').join(', ')})`
            ).join(', ');

            const values = normalizedBatch.flatMap(channel =>
                columnsArray.map(column => channel[column])
            );


            /*
             for (const channel of normalizedBatch) {
                
            columnsArray.map(column => { 
                console.log(channel, channel[column])
             })
             }
            */

            try {
                await execute(`
                    INSERT INTO \`${this.table}\`
                    (${columns})
                    VALUES ${placeholders}
                    ON DUPLICATE KEY UPDATE
                    ${updateClause}
                `, values);

                logger.debug(`Batch ${Math.floor(i / batchSize) + 1} inserted: ${batch.length} channel`);
            } catch (error) {
                logger.debug(`❌ Erreur lors de l'insertion du lot: ${error.message}`);
                logger.debug('Détails de l\'erreur:', error.sqlMessage || error.code);

                // Fallback: insertion un par un avec diagnostic
                logger.debug('Tentative d\'insertion un par un...');

                let successCount = 0;
                let errorCount = 0;

                for (const channel of normalizedBatch) {
                    try {
                        await execute(`
                            INSERT INTO \`${this.table}\`
                            (${columns})
                            VALUES (${columnsArray.map(() => '?').join(', ')})
                            ON DUPLICATE KEY UPDATE
                            ${updateClause}
                        `, columnsArray.map(column => channel[column]));
                        successCount++;
                    } catch (singleError) {
                        errorCount++;
                        logger.debug(`❌ Échec insertion canal (${errorCount}): ${singleError.message}`);
                        logger.debug('Données problématiques:', JSON.stringify(channel, null, 2));
                    }
                }

                logger.debug(`Résultat fallback: ${successCount} succès, ${errorCount} échecs`);
            }
        }
    }

    async insertChannel(channelData) {

        const channel = channelData.name;
        const num_users = channelData.num_users;

        if (num_users > 1) {
            //logger.debug(`Canal "${channel}" existe déjà avec ${existing} utilisateurs`);

            const channelObj = this.channels.find(c => c.name === channel);
            if (channelObj) {
                channelObj.num_users = num_users;
                logger.debug(`   +The \x1b[33m${channel}\x1b[0m channel now has \x1b[33m${channelObj.num_users}\x1b[0m users`);
                await this.num_usersChange(channel, channelObj.num_users)
            }

            return;
        }

        const data = await this.rpc.getChannel(channel);

        // Obtenir toutes les colonnes nécessaires
        const allColumns = this.getAllColumnsFromChannels();
        const columnsArray = Array.from(allColumns);

        if (columnsArray.length === 0) {
            logger.debug('❌ No columns available for insertion');
            return false;
        }

        // Vérifier que la table existe
        //await this.ensureTable();

        // Normaliser le canal
        const normalizedChannel = this.normalizeChannel(data, allColumns);
        const columns = columnsArray.map(k => `\`${k}\``).join(', ');
        const placeholders = columnsArray.map(() => '?').join(', ');
        const values = columnsArray.map(column => normalizedChannel[column]);

        try {

            // Insertion
            await execute(`
            INSERT INTO \`${this.table}\`
            (${columns})
            VALUES (${placeholders})
        `, values);

            logger.debug(`✅ Canal inséré avec succès.`);


            return {
                success: true,
                channel: normalizedChannel
            };
        } catch (error) {
            logger.debug(`❌ Erreur lors de l'insertion du canal: ${error.message}`);

            // Gestion spécifique des erreurs
            if (error.code === 'ER_BAD_FIELD_ERROR') {
                logger.debug('⚠️ Missing column, attempting to add...');
                const missingColumn = this.extractMissingColumnFromError(error);
                if (missingColumn) {
                    await this.addMissingColumn(missingColumn);
                    // Réessayer l'insertion
                    return await this.insertChannel(channelData);
                }
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    async deleteChannel(channelData) {
        const channel = channelData.name;
        const num_users = channelData.num_users;

        try {
            if (num_users <= 1) {

                const [result] = await execute(
                    `DELETE FROM \`${this.table}\` WHERE \`name\` = ? AND num_users <= 1`,
                    [channel]
                );

                if (result.affectedRows > 0)
                    logger.debug(`✅ Canal supprimé avec succès`);

                return {
                    success: result.affectedRows > 0,
                    channel: channel
                };
            } else {
                const channelObj = this.channels.find(c => c.name === channel);
                if (channelObj) {
                    channelObj.num_users = num_users - 1;
                    logger.debug(`   -The \x1b[33m${channel}\x1b[0m channel now has \x1b[33m${channelObj.num_users}\x1b[0m users`);
                    await this.num_usersChange(channel, channelObj.num_users)
                }

                return;
            }
            return {
                success: false,
                channel: channel
            };
        } catch (error) {
            logger.debug(`❌ Erreur lors de la suppression du canal: ${error.message}`);
        }
    }


    /**
     * Vérifie si un canal existe déjà
     */
    async checkChannelExists(channelName) {
        try {
            const [rows] = await execute(
                `SELECT id, num_users FROM \`${this.table}\` WHERE \`name\` = ? LIMIT 1`,
                [channelName]
            );

            return rows.length > 0 ? { id: rows[0].id, num_users: rows[0].num_users } : false;
        } catch (error) {
            logger.debug("Erreur lors de la vérification du canal :", error);
            return false;
        }
    }



    /* =========================
       FONCTION PRINCIPALE
    ========================= */


    async main() {
        try {
            logger.debug(`Starting channel synchronization... (${this.channels.length} channels)`);

            // Afficher un échantillon pour debug
            if (this.channels.length > 0) {
                logger.debug('Sample from the first channel:', JSON.stringify(this.channels[0], null, 2));
            }

            await this.ensureTable();
            await this.truncateTable();
            await this.insertChannels();

            logger.debug(`✅ Synchronization complete: ${this.channels.length} channels processed`);

            return {
                success: true,
                count: this.channels.length,
                table: this.table
            };
        } catch (err) {
            logger.debug('❌ Error during channel synchronization:', err);

            if (err.code === 'ER_BAD_FIELD_ERROR' || err.code === 'ER_NO_SUCH_TABLE') {
                logger.debug('⚠️ Schéma incompatible → recréation de la table...');
                try {
                    await this.recreateTable();
                    await this.insertChannels();
                    logger.debug('✅ Table recréée et données insérées');
                    return {
                        success: true,
                        recovered: true,
                        count: this.channels.length
                    };
                } catch (recoveryError) {
                    logger.debug('❌ Échec de la récupération:', recoveryError);
                    throw recoveryError;
                }
            }

            throw err;
        }
    }

    /* =========================
       MÉTHODES UTILITAIRES
    ========================= */

    async getChannelCount() {
        try {
            const result = await execute(`SELECT COUNT(*) as count FROM \`${this.table}\``);
            return result[0]?.count || 0;
        } catch {
            return 0;
        }
    }

    async getTableColumns() {
        try {
            const result = await execute(`
                SELECT COLUMN_NAME, DATA_TYPE 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = ?
                ORDER BY ORDINAL_POSITION
            `, [this.table]);
            return result;
        } catch {
            return [];
        }
    }

    async compareSchemas() {
        const expectedColumns = this.getAllColumnsFromChannels();
        const tableColumns = await this.getTableColumns();

        const tableColumnNames = new Set(tableColumns.map(row => row.COLUMN_NAME));

        logger.debug(' Comparing schemas:');
        logger.debug(`  - Expected columns: ${Array.from(expectedColumns).length}`);
        logger.debug(`  - Columns in table ${tableColumnNames.size}`);

        const missingInTable = Array.from(expectedColumns).filter(col => !tableColumnNames.has(col));
        const extraInTable = Array.from(tableColumnNames).filter(col =>
            !expectedColumns.has(col) &&
            !['id', 'created_at', 'updated_at'].includes(col)
        );

        if (missingInTable.length > 0) {
            logger.debug(`   Missing columns in table: ${missingInTable.join(', ')}`);
        }
        if (extraInTable.length > 0) {
            logger.debug(`   Extra columns in table: ${extraInTable.join(', ')}`);
        }

        return {
            expected: Array.from(expectedColumns),
            actual: Array.from(tableColumnNames),
            missing: missingInTable,
            extra: extraInTable
        };
    }

    async cleanup() {
        this.channels = [];
        logger.debug('Nettoyage effectué');
    }

    /*
    {
        name: '#otaku',
        creation_time: '2025-10-24T10:38:01.000Z',
        num_users: 4,
        topic: '\x0310Bienvenue dans le salon #Otaku.',
        topic_set_by: 'Lucide2',
        topic_set_at: '2025-10-26T05:08:02.000Z',
        modes: 'nrtCPRTV'
    }
    */
    updateCountChannel(target, num_users, op = "+") {
        const channel = this.channels.find(c => c.name === target);
        if (!channel) return;

        if (op === "+") {
            channel.num_users += num_users;
        } else if (op === "-") {
            channel.num_users -= num_users;
        }

        return channel.num_users;
    }

    countChannel(target) {
        return this.channels.find(c => c.name === target)?.num_users;
    }

    getChannel(target) {
        return this.channels.find(c => c.name === target);
    }

    channelExists(target) {
        return !!this.getChannel(target);
    }

    getChannelUsers(target) {
        return this.getChannel(target)?.num_users;
    }

    async num_usersChange(channel, value) {
        const usersTable = config.mysql.table_prefix + 'channels';
        await execute(
            `UPDATE ${usersTable} SET num_users = ? WHERE name = ? LIMIT 1`,
            [value, channel]
        );
    }


};

