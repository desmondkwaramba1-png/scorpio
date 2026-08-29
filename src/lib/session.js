const { randomUUID } = require('crypto');
const db = require('../db/schema');

const TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || '30', 10);

function createSession(userId) {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expiresAt);
  return { id, expiresAt };
}

function getSessionUser(sessionId) {
  if (!sessionId) return null;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
}

function destroySession(sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

module.exports = { createSession, getSessionUser, destroySession, TTL_DAYS };
