const { randomBytes } = require('crypto');

// Long opaque token for links (email verification, email-based password reset).
function generateToken() {
  return randomBytes(24).toString('hex');
}

module.exports = { generateToken };
