const express = require('express');
const { requireStudent } = require('../middleware/auth');
const pool = require('../db');
const router = express.Router();

router.use(requireStudent);

// Dashboard — counts by status + recent complaints
router.get('/dashboard', async (req, res) => {
  const studentId = req.session.user.id;

  try {
    const countsResult = await pool.query(
      `SELECT status, COUNT(*) AS count
       FROM complaints
       WHERE student_id = $1
       GROUP BY status`,
      [studentId]
    );

    // Turn [{status: 'Submitted', count: '2'}, ...] into { Submitted: 2, ... }
    const counts = {};
    countsResult.rows.forEach(row => {
      counts[row.status] = parseInt(row.count, 10);
    });

    const recentResult = await pool.query(
      `SELECT id, title, status
       FROM complaints
       WHERE student_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [studentId]
    );

    res.render('student/dashboard', {
      counts,
      recentComplaints: recentResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load the dashboard.' });
  }
});

// Submit-complaint form (unchanged from Milestone 6)
router.get('/complaints/new', async (req, res) => {
  try {
    const categories = await pool.query('SELECT id, name FROM categories WHERE active = true ORDER BY name');
    res.render('student/submit', { categories: categories.rows, message: null });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load the form.' });
  }
});

router.post('/complaints', async (req, res) => {
  const { category_id, title, description } = req.body;
  const studentId = req.session.user.id;

  if (!category_id || !title || !description) {
    const categories = await pool.query('SELECT id, name FROM categories WHERE active = true ORDER BY name');
    return res.render('student/submit', {
      categories: categories.rows,
      message: { type: 'error', text: 'All fields are required.' },
      formData: req.body,
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO complaints (student_id, category_id, title, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status`,
      [studentId, category_id, title, description]
    );

    const newComplaint = result.rows[0];

    await pool.query(
      `INSERT INTO complaint_history (complaint_id, changed_by, old_status, new_status, comment)
       VALUES ($1, $2, NULL, $3, 'Complaint submitted by student.')`,
      [newComplaint.id, studentId, newComplaint.status]
    );

    res.redirect(`/student/complaints/${newComplaint.id}?submitted=1`);
  } catch (err) {
    console.error(err);
    const categories = await pool.query('SELECT id, name FROM categories WHERE active = true ORDER BY name');
    res.status(500).render('student/submit', {
      categories: categories.rows,
      message: { type: 'error', text: 'Something went wrong. Please try again.' },
      formData: req.body,
    });
  }
});

// My Complaints — real version
router.get('/complaints', async (req, res) => {
  const studentId = req.session.user.id;

  try {
    const result = await pool.query(
      `SELECT c.id, c.title, c.status, c.created_at, cat.name AS category_name
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       WHERE c.student_id = $1
       ORDER BY c.created_at DESC`,
      [studentId]
    );

    res.render('student/my-complaints', { complaints: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load your complaints.' });
  }
});

// Complaint details (unchanged from Milestone 6)
router.get('/complaints/:id', async (req, res) => {
  const studentId = req.session.user.id;
  const complaintId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT c.*, cat.name AS category_name
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       WHERE c.id = $1 AND c.student_id = $2`,
      [complaintId, studentId]
    );

    if (result.rows.length === 0) {
      return res.status(404).render('error', {
        title: 'Not Found',
        message: 'That complaint does not exist or does not belong to you.',
      });
    }

    res.render('student/complaint-details', {
      complaint: result.rows[0],
      submitted: req.query.submitted === '1',
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load the complaint.' });
  }
});

module.exports = router;