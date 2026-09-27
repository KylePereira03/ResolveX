const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');

const router = express.Router();

// ---------- REGISTER (unchanged from Milestone 3) ----------

router.get('/register', (req, res) => {
  res.render('auth/register', { message: null });
});

router.post('/register', async (req, res) => {
  const { full_name, email: rawEmail, student_id_number, password, confirm_password } = req.body;
  const email = rawEmail.trim().toLowerCase();

  if (!full_name || !email || !student_id_number || !password || !confirm_password) {
    return res.render('auth/register', {
      message: { type: 'error', text: 'All fields are required.' },
      formData: req.body,
    });
  }
  if (password !== confirm_password) {
    return res.render('auth/register', {
      message: { type: 'error', text: 'Passwords do not match.' },
      formData: req.body,
    });
  }
  if (password.length < 6) {
    return res.render('auth/register', {
      message: { type: 'error', text: 'Password must be at least 6 characters.' },
      formData: req.body,
    });
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.render('auth/register', {
        message: { type: 'error', text: 'That email is already registered.' },
        formData: req.body,
      });
    }

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
      message: { type: 'error', text: 'Something went wrong. Please try again.' },
      formData: req.body,
    });
  }
});

// ---------- STUDENT LOGIN ----------

router.get('/login', (req, res) => {
  res.render('auth/login', { message: null, registered: req.query.registered === '1' });
});

router.post('/login', async (req, res) => {
  const { email: rawEmail, password } = req.body;
  const email = rawEmail.trim().toLowerCase();

  if (!email || !password) {
    return res.render('auth/login', {
      message: { type: 'error', text: 'Email and password are required.' },
      formData: req.body,
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, role
       FROM users WHERE email = $1 AND role = 'student'`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.render('auth/login', {
        message: { type: 'error', text: 'Invalid email or password.' },
        formData: req.body,
      });
    }

    const student = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, student.password_hash);

    if (!passwordMatches) {
      return res.render('auth/login', {
        message: { type: 'error', text: 'Invalid email or password.' },
        formData: req.body,
      });
    }

    // Save just enough info in the session
    req.session.user = {
      id: student.id,
      full_name: student.full_name,
      role: student.role,
    };

    res.redirect('/student/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).render('auth/login', {
      message: { type: 'error', text: 'Something went wrong. Please try again.' },
      formData: req.body,
    });
  }
});

// ---------- ADMIN LOGIN ----------

router.get('/admin/login', (req, res) => {
  res.render('auth/admin-login', { message: null });
});

router.post('/admin/login', async (req, res) => {
  const { email: rawEmail, password } = req.body;
  const email = rawEmail.trim().toLowerCase();

  if (!email || !password) {
    return res.render('auth/admin-login', {
      message: { type: 'error', text: 'Email and password are required.' },
      formData: req.body,
    });
  }

  try {
    const result = await pool.query(
      `SELECT id, full_name, email, password_hash, role
       FROM users WHERE email = $1 AND role = 'admin'`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.render('auth/admin-login', {
        message: { type: 'error', text: 'Invalid email or password.' },
        formData: req.body,
      });
    }

    const admin = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, admin.password_hash);

    if (!passwordMatches) {
      return res.render('auth/admin-login', {
        message: { type: 'error', text: 'Invalid email or password.' },
        formData: req.body,
      });
    }

    req.session.user = {
      id: admin.id,
      full_name: admin.full_name,
      role: admin.role,
    };

    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).render('auth/admin-login', {
      message: { type: 'error', text: 'Something went wrong. Please try again.' },
      formData: req.body,
    });
  }
});

// ---------- LOGOUT ----------

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;