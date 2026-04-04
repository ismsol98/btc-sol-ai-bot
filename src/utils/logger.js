// src/utils/logger.js
// Sistem logging terpusat menggunakan Winston

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// Pastikan folder logs ada
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      const log = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
      return stack ? `${log}\n${stack}` : log;
    })
  ),
  transports: [
    // Log ke console dengan warna
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf(({ timestamp, level, message }) => {
          return `[${timestamp}] ${level}: ${message}`;
        })
      ),
    }),
    // Log error ke file
    new transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
    }),
    // Log semua ke file
    new transports.File({
      filename: path.join(logsDir, 'combined.log'),
    }),
  ],
});

module.exports = logger;
