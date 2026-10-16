const path = require('path');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const logger = require('./logger');

const AUTH_DIR = path.join(__dirname, '..', 'auth');
const baileysLogger = pino({ level: 'silent' });

let sock = null;
let ready = false;
const readyWaiters = [];

function setReady(v) {
  ready = v;
  if (v) readyWaiters.splice(0).forEach((fn) => fn());
}

function whenReady() {
  return ready ? Promise.resolve() : new Promise((r) => readyWaiters.push(r));
}

async function connect(phoneNumber) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger: baileysLogger,
    printQRInTerminal: false,
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  // Not linked yet: request a pairing code for "Linked Devices > Link with phone number".
  if (!sock.authState.creds.registered) {
    if (!phoneNumber) throw new Error('PHONE_NUMBER env var required for first-time pairing');
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(phoneNumber);
        const pretty = code.match(/.{1,4}/g).join('-');
        logger.warn(`PAIRING CODE: ${pretty}  (WhatsApp > Linked Devices > Link with phone number)`);
      } catch (err) {
        logger.error({ err: err.message }, 'pairing code request failed');
      }
    }, 3000);
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      logger.info('WhatsApp connected');
      setReady(true);
    } else if (connection === 'close') {
      setReady(false);
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code === DisconnectReason.loggedOut) {
        logger.error('Logged out from phone. Delete ./auth and re-pair.');
        process.exit(1);
      }
      logger.warn({ code }, 'connection closed, reconnecting in 5s');
      setTimeout(() => connect(phoneNumber).catch((e) => logger.error(e)), 5000);
    }
  });
}

async function sendText(to, text) {
  await whenReady();
  const digits = String(to).replace(/\D/g, '');
  if (digits.length < 8) throw new Error(`invalid number: ${to}`);
  const jid = `${digits}@s.whatsapp.net`;
  const res = await sock.sendMessage(jid, { text: String(text) });
  return res?.key?.id || null;
}

module.exports = { connect, sendText };
