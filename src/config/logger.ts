import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { ENV } from './env.js';

// Custom format for structured logging
const customFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      ...(stack ? { stack } : {}),
      ...meta,
    });
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}${stack ? `\\n${stack}` : ''}`;
  })
);

// Create transports
const transports: winston.transport[] = [];

// Console transport for development
if (ENV.NODE_ENV === 'development') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: ENV.LOG_LEVEL,
    })
  );
}

// File transports for production
if (ENV.NODE_ENV === 'production') {
  // Application logs
  transports.push(
    new DailyRotateFile({
      filename: `${ENV.LOG_FILE_PATH}/app-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: customFormat,
      level: ENV.LOG_LEVEL,
    })
  );

  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: `${ENV.LOG_FILE_PATH}/error-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: customFormat,
      level: 'error',
    })
  );

  // Console for production (structured)
  transports.push(
    new winston.transports.Console({
      format: customFormat,
      level: 'info',
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: ENV.LOG_LEVEL,
  format: customFormat,
  transports,
  exitOnError: false,
});

// Stream for express morgan integration
export const logStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// Log startup information
logger.info('Logger initialized', {
  nodeEnv: ENV.NODE_ENV,
  logLevel: ENV.LOG_LEVEL,
  logPath: ENV.LOG_FILE_PATH,
});
