const db = require('../db/schema');
const payment = require('../services/payment');
const { markPurchasePaid, markPurchaseFailed } = require('./purchaseCompletion');

// There is no Dischub webhook configured, so the only thing that ever asked
// "was this order paid?" was the buyer's browser polling the return page. A
// buyer who closed that page before approving the EcoCash prompt was charged
// while the order sat 'pending' forever. This asks Dischub on the buyer's
// behalf, so a late approval still completes the order and delivers the file.
//
// markPurchasePaid/Failed are idempotent, so racing the browser's own poll or
// a second run is safe.
const GIVE_UP_AFTER_HOURS = 24;
const SETTLE_SECONDS = 20; // let the buyer's own poll go first

// Younger orders are checked every run; older ones back off so abandoned
// checkouts do not hammer the gateway all day.
function ageBandSql(tick) {
  const bands = ["pu.created_at >= datetime('now','-10 minutes')"];
  if (tick % 5 === 0) bands.push("pu.created_at >= datetime('now','-3 hours')");
  if (tick % 30 === 0) bands.push(`pu.created_at >= datetime('now','-${GIVE_UP_AFTER_HOURS} hours')`);
  return bands.join(' OR ');
}

function pendingReferences({ userId = null, tick = 0, limit = 25 } = {}) {
  const join = userId ? 'JOIN buyers b ON b.id = pu.buyer_id' : '';
  const owner = userId ? 'AND b.user_id = ?' : '';
  const sql = `
    SELECT DISTINCT pu.payment_reference AS ref FROM purchases pu ${join}
    WHERE pu.payment_status = 'pending' AND pu.payment_reference IS NOT NULL
      AND pu.created_at <= datetime('now','-${SETTLE_SECONDS} seconds')
      AND (${ageBandSql(userId ? 0 : tick)})
      ${owner}
    ORDER BY pu.created_at ASC LIMIT ?`;
  return db.prepare(sql).all(...(userId ? [userId, limit] : [limit])).map(r => r.ref);
}

async function reconcileReference(ref) {
  const result = await payment.checkOrderStatus(ref);
  if (result.status !== 'success' && result.status !== 'failed') return null;
  const ids = db.prepare("SELECT id FROM purchases WHERE payment_reference = ? AND payment_status = 'pending'").all(ref).map(r => r.id);
  for (const id of ids) {
    if (result.status === 'success') markPurchasePaid(id);
    else markPurchaseFailed(id);
  }
  return { ref, status: result.status, count: ids.length };
}

let running = false;
let tick = 0;

// Background sweep (all buyers). Never throws; one slow gateway call cannot
// stack up because overlapping runs are skipped.
async function reconcilePendingPayments() {
  if (running || !payment.isConfigured()) return [];
  running = true;
  tick += 1;
  const settled = [];
  try {
    for (const ref of pendingReferences({ tick })) {
      try {
        const outcome = await reconcileReference(ref);
        if (outcome) settled.push(outcome);
      } catch (err) {
        console.error('[payment reconcile]', ref, err.message);
      }
    }
  } finally {
    running = false;
  }
  return settled;
}

// Same check for just one signed-in buyer's own pending orders, used when they
// open their account so a paid order shows as paid straight away.
async function reconcileForUser(userId) {
  if (!payment.isConfigured()) return [];
  const settled = [];
  for (const ref of pendingReferences({ userId, limit: 5 })) {
    try {
      const outcome = await reconcileReference(ref);
      if (outcome) settled.push(outcome);
    } catch (err) {
      console.error('[payment reconcile]', ref, err.message);
    }
  }
  return settled;
}

function startPaymentReconciler(intervalMs = 60 * 1000) {
  const timer = setInterval(() => {
    reconcilePendingPayments().catch(err => console.error('[payment reconcile]', err.message));
  }, intervalMs);
  timer.unref();
  return timer;
}

module.exports = { reconcilePendingPayments, reconcileForUser, startPaymentReconciler };
