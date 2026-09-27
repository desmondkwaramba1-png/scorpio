const db = require('../db/schema');

// How long a buyer has to confirm or dispute after the seller marks a
// service delivered before it auto-releases. Protects a seller from an
// unresponsive buyer holding their money forever, same as Fiverr/Upwork's
// own auto-release windows.
const AUTO_RELEASE_DAYS = 5;

// Lazy sweep instead of a real scheduler: this app has no background worker
// process, so "time passing" is only ever noticed when something reads
// state. Called at the top of every route whose response depends on
// fulfillment_status (wallet balance, order lists) — cheap, and correct
// regardless of how long the server's been idle.
function sweepAutoReleases() {
  db.prepare(`
    UPDATE purchases SET fulfillment_status = 'released'
    WHERE fulfillment_status = 'delivered'
      AND delivered_at <= datetime('now', '-${AUTO_RELEASE_DAYS} days')
  `).run();
}

function getPurchase(purchaseId) {
  return db.prepare('SELECT * FROM purchases WHERE id = ?').get(purchaseId);
}

// Called right after a service purchase is confirmed paid (from
// purchaseCompletion.js) — starts the escrow clock at "awaiting_delivery"
// rather than crediting the seller's wallet immediately the way an instant
// digital-goods purchase would.
function startEscrow(purchaseId) {
  db.prepare("UPDATE purchases SET fulfillment_status = 'awaiting_delivery' WHERE id = ?").run(purchaseId);
}

// Digital goods deliver instantly — the file/key handoff already happened
// by the time markPurchasePaid() calls this, so there's nothing for the
// seller to separately "mark delivered." Skips straight to the 'delivered'
// state (instead of startEscrow()'s 'awaiting_delivery') so the buyer gets
// the same 5-day report/auto-release window a service order gets once its
// own delivery lands, without a service_deliveries row that has no real
// delivery message to hold.
function startDeliveredHold(purchaseId) {
  db.prepare("UPDATE purchases SET fulfillment_status = 'delivered', delivered_at = datetime('now') WHERE id = ?").run(purchaseId);
}

function markDelivered(purchaseId, { message, storagePath, originalFilename, externalUrl }) {
  db.prepare(`
    INSERT INTO service_deliveries (purchase_id, message, storage_path, original_filename, external_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(purchaseId, message, storagePath || null, originalFilename || null, externalUrl || null);
  db.prepare("UPDATE purchases SET fulfillment_status = 'delivered', delivered_at = datetime('now') WHERE id = ?").run(purchaseId);
}

// The buyer's own "yes, this is done" — releases immediately rather than
// waiting out the auto-release window.
function confirmDelivery(purchaseId) {
  db.prepare("UPDATE purchases SET fulfillment_status = 'released' WHERE id = ? AND fulfillment_status = 'delivered'").run(purchaseId);
}

function openDispute(purchaseId, reason, openedByUserId = null) {
  const existing = db.prepare("SELECT * FROM service_disputes WHERE purchase_id = ? AND status = 'open'").get(purchaseId);
  if (existing) return existing;

  db.prepare('INSERT INTO service_disputes (purchase_id, reason, opened_by_user_id) VALUES (?, ?, ?)')
    .run(purchaseId, reason, openedByUserId || null);
  db.prepare("UPDATE purchases SET fulfillment_status = 'disputed' WHERE id = ?").run(purchaseId);
  return disputeFor(purchaseId);
}

// resolution is 'refund' or 'release'. "Refund" here is a state change —
// it stops the money from ever counting toward the seller's wallet — not
// an automated EcoCash transfer back to the buyer, which isn't wired to
// any gateway (same honesty as wallet.js's withdraw stub: nothing here
// pretends money physically moved that didn't).
function resolveDispute(disputeId, resolution, note) {
  const dispute = db.prepare('SELECT * FROM service_disputes WHERE id = ?').get(disputeId);
  if (!dispute || dispute.status !== 'open') return null;

  const newFulfillment = resolution === 'refund' ? 'refunded' : 'released';
  const newDisputeStatus = resolution === 'refund' ? 'resolved_refund' : 'resolved_release';

  db.prepare("UPDATE purchases SET fulfillment_status = ? WHERE id = ?").run(newFulfillment, dispute.purchase_id);
  db.prepare("UPDATE service_disputes SET status = ?, resolved_at = datetime('now'), resolution_note = ? WHERE id = ?")
    .run(newDisputeStatus, note || null, disputeId);

  // A refunded digital order shouldn't keep handing out the file from this
  // platform. The buyer may already have a copy — that's the hard part of
  // digital returns, and why an admin reads the thread before deciding —
  // but new downloads from here stop.
  if (resolution === 'refund') {
    db.prepare("UPDATE download_tokens SET expires_at = datetime('now') WHERE purchase_id = ?").run(dispute.purchase_id);
  }

  return db.prepare('SELECT * FROM service_disputes WHERE id = ?').get(disputeId);
}

function deliveryFor(purchaseId) {
  return db.prepare('SELECT * FROM service_deliveries WHERE purchase_id = ? ORDER BY id DESC LIMIT 1').get(purchaseId);
}

function disputeFor(purchaseId) {
  return db.prepare('SELECT * FROM service_disputes WHERE purchase_id = ? ORDER BY id DESC LIMIT 1').get(purchaseId);
}

module.exports = {
  AUTO_RELEASE_DAYS, sweepAutoReleases, getPurchase, startEscrow, startDeliveredHold, markDelivered,
  confirmDelivery, openDispute, resolveDispute, deliveryFor, disputeFor
};
