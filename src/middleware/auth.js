const { getSessionUser } = require('../lib/session');
const db = require('../db/schema');

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'zimselar_session';

// Runs on every request: attaches req.user and req.creator (both null if
// not logged in / no creator profile yet) so downstream handlers don't
// each have to re-look-up the session.
function attachUser(req, res, next) {
  const sessionId = req.cookies?.[COOKIE_NAME];
  const user = getSessionUser(sessionId);
  req.user = user || null;
  req.creator = user
    ? db.prepare('SELECT * FROM creators WHERE user_id = ?').get(user.id) || null
    : null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Log in to continue.' });
  next();
}

function requireCreator(req, res, next) {
  if (!req.creator) return res.status(403).json({ error: 'Complete your creator profile first.' });
  next();
}

module.exports = { attachUser, requireAuth, requireCreator, COOKIE_NAME };
