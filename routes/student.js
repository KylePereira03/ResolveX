const express = require('express');
const { requireStudent } = require('../middleware/auth');
const router = express.Router();

// Every route below this line requires a logged-in student
router.use(requireStudent);

router.get('/dashboard', (req, res) => {
  res.render('student/dashboard-placeholder');
});

module.exports = router;