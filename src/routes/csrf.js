// src/routes/csrf.js
const express = require('express');
const router = express.Router();

// GET /api/csrf/token – returns the CSRF token for the client to store
router.get('/token', (req, res) => {
  // csurf middleware adds req.csrfToken()
  const token = req.csrfToken();
  res.json({ csrfToken: token });
});

module.exports = router;

