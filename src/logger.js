const fs = require('fs');
const path = require('path');
const pino = require('pino');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_BYTES = 2 * 1024 * 1024;

fs.mkdirSync(LOG_DIR, { recursive: true });
const file = path.join(LOG_DIR, 'mywapi.log');

// Simple rotation: keep one previous file.
try {
  if (fs.statSync(file).size > MAX_BYTES) fs.renameSync(file, file + '.1');
} catch (_) {}

const logger = pino(
  { level: process.env.LOG_LEVEL || 'info' },
  pino.multistream([
    { stream: process.stdout },
    { stream: pino.destination({ dest: file, sync: false, mkdir: true }) },
  ])
);

module.exports = logger;
