const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');

const router = express.Router();

// Show the registration form
router.get('/register', (req, res) => {
  res.render('auth/register', { user: null, message: null });
});

// Handle the registration form submission
router.post('/register', async (req, res) => {
  const { full_name, email, student_id_number, password, confirm_password } = req.body;

  // Basic validation
  if (!full_name || !email || !student_id_number || !password || !confirm_password) {
    return res.render('auth/register', {
      user: null,
      message: { type: 'error', text: 'All fields are required.' },
      formData: req.body,
    });
  }

  if (password !== confirm_password) {
    return res.render('auth/register', {
      user: null,
      message: { type: 'error', text: 'Passwords do not match.' },
      formData: req.body,
    });
  }

  if (password.length < 6) {
    return res.render('auth/register', {
      user: null,
      message: { type: 'error', text: 'Password must be at least 6 characters.' },
      formData: req.body,
    });
  }

  try {
    // Check if the email is already registered
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.render('auth/register', {
        user: null,
        message: { type: 'error', text: 'That email is already registered.' },
        formData: req.body,
      });
    }

    // Hash the password and save the new student
    const password_hash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, student_id_number)
       VALUES ($1, $2, $3, 'student', $4)`,
      [full_name, email, password_hash, student_id_number]
    );

    res.redirect('/login?registered=1');
  } catch (err) {
    console.error(err);
    res.status(500).render('auth/register', {
      user: null,
      message: { type: 'error', text: 'Something went wrong. Please try again.' },
      formData: req.body,
    });
  }
});

// Temporary placeholder — real version comes in Milestone 4
router.get('/login', (req, res) => {
  res.render('auth/login', { user: null, registered: req.query.registered === '1' });
});

module.exports = router;