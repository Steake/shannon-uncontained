/**
 * Routes Index - LSG v2 Generated
 */

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

module.exports = router;
