require('dotenv').config();
const admin = require('firebase-admin');
const logger = require('./logger');
const { connect, sendText } = require('./whatsapp');

const COLLECTION = process.env.COLLECTION || 'wa_messages';
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 3);
const SEND_DELAY_MS = Number(process.env.SEND_DELAY_MS || 1500);
const STALE_MS = 2 * 60 * 1000;

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const { FieldValue, Timestamp } = admin.firestore;

const queue = [];
const queued = new Set();
let draining = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Atomically move pending -> sending so a doc is never processed twice.
async function claim(ref) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data();
    if (d.status !== 'pending') return null;
    tx.update(ref, {
      status: 'sending',
      claimedAt: FieldValue.serverTimestamp(),
      attempts: (d.attempts || 0) + 1,
    });
    return { ...d, attempts: (d.attempts || 0) + 1 };
  });
}

async function process_(ref) {
  const data = await claim(ref);
  if (!data) return;

  const { to, text } = data;
  try {
    if (!to || !text) throw new Error('missing "to" or "text"');
    const waId = await sendText(to, text);
    await ref.update({
      status: 'sent',
      sentAt: FieldValue.serverTimestamp(),
      waMessageId: waId,
      error: FieldValue.delete(),
    });
    logger.info({ id: ref.id, to }, 'sent');
  } catch (err) {
    const final = data.attempts >= MAX_ATTEMPTS || /missing|invalid number/.test(err.message);
    await ref.update({
      status: final ? 'failed' : 'pending',
      error: err.message,
      failedAt: FieldValue.serverTimestamp(),
    });
    logger.error({ id: ref.id, to, attempt: data.attempts, final, err: err.message }, 'send failed');
  }
}

async function drain() {
  if (draining) return;
  draining = true;
  while (queue.length) {
    const ref = queue.shift();
    queued.delete(ref.path);
    try {
      await process_(ref);
    } catch (err) {
      logger.error({ id: ref.id, err: err.message }, 'process error');
    }
    await sleep(SEND_DELAY_MS);
  }
  draining = false;
}

function enqueue(ref) {
  if (queued.has(ref.path)) return;
  queued.add(ref.path);
  queue.push(ref);
  drain();
}

// Docs stuck in "sending" (crash mid-send) go back to pending.
async function recoverStale() {
  const cutoff = Timestamp.fromMillis(Date.now() - STALE_MS);
  const snap = await db.collection(COLLECTION).where('status', '==', 'sending').get();
  for (const doc of snap.docs) {
    const c = doc.get('claimedAt');
    if (!c || c.toMillis() < cutoff.toMillis()) {
      await doc.ref.update({ status: 'pending' });
      logger.warn({ id: doc.id }, 'recovered stale sending doc');
    }
  }
}

async function main() {
  logger.info({ collection: COLLECTION }, 'MyWapi starting');
  await connect(process.env.PHONE_NUMBER);
  await recoverStale();
  setInterval(() => recoverStale().catch((e) => logger.error(e.message)), STALE_MS);

  db.collection(COLLECTION)
    .where('status', '==', 'pending')
    .onSnapshot(
      (snap) => snap.docChanges().forEach((c) => c.type !== 'removed' && enqueue(c.doc.ref)),
      (err) => {
        logger.error({ err: err.message }, 'firestore listener error, exiting for restart');
        process.exit(1);
      }
    );
  logger.info('listening for pending messages');
}

process.on('unhandledRejection', (e) => logger.error({ err: String(e) }, 'unhandledRejection'));
main().catch((e) => {
  logger.fatal({ err: e.message }, 'fatal');
  process.exit(1);
});
