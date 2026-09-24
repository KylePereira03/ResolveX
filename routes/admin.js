const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Every route below this line requires a logged-in admin
router.use(requireAdmin);

router.get('/dashboard', (req, res) => {
  res.render('admin/dashboard-placeholder');
});

module.exports = router;