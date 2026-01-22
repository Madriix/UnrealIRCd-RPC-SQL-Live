const config = require('./../../config');
const winston = require('winston');

class Logger {
    constructor() {
        const format = !config.debug
            ? winston.format.printf(({ message }) => message)
            : winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ level, message }) => `${level}: ${message}`)
            );

        this.logger = winston.createLogger({
            level: config.debug ? 'debug' : 'error',
            format,
            transports: [new winston.transports.Console()]
        });
    }

    debug(message) {
        this.logger.debug(message);
    }

    info(message) {
        this.logger.info(message);
    }

    warn(message) {
        this.logger.warn(message);
    }

    error(message) {
        this.logger.error(message);
    }
}

module.exports = Logger;
