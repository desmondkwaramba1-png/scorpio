const { randomBytes, randomInt } = require('crypto');

// Long opaque token for links (email verification, email-based password reset).
function generateToken() {
  return randomBytes(24).toString('hex');
}

// Short numeric code for channels where a link isn't clickable (WhatsApp text).
function generateCode() {
  return String(randomInt(100000, 1000000));
}

module.exports = { generateToken, generateCode };
