// Structured logging: JSON lines in production (ready for any log collector), readable lines in development.
const winston = require('winston');

const prod = process.env.NODE_ENV === 'production';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (prod ? 'info' : 'debug'),
  defaultMeta: { service: 'derivion-lms-api' },
  format: prod
    ? winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json())
    : winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.printf(({ timestamp, level, message, stack, service, ...meta }) => {
        const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        return `${timestamp} ${level} ${message}${extra}${stack ? `\n${stack}` : ''}`;
      }),
    ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
