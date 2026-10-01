const express = require('express');
const { requireStudent } = require('../middleware/auth');
const pool = require('../db');
const upload = require('../middleware/upload');
const fs = require('fs');
const path = require('path');
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

router.post('/complaints', (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    if (err) {
      // Multer errors (wrong type, too large) land here
      return renderSubmitError(req, res, err.message);
    }
    next();
  });
}, async (req, res) => {
  const { category_id, title: rawTitle, description: rawDescription } = req.body;
  const title = rawTitle.trim();
  const description = rawDescription.trim();
  const studentId = req.session.user.id;

  if (!category_id || !title || !description) {
    // Clean up an uploaded file if the rest of the form is invalid
    if (req.file) fs.unlinkSync(req.file.path);
    return renderSubmitError(req, res, 'All fields are required.');
  }

  try {
    const attachmentPath = req.file ? req.file.filename : null;
    const attachmentOriginalName = req.file ? req.file.originalname : null;

    const result = await pool.query(
      `INSERT INTO complaints (student_id, category_id, title, description, attachment_path, attachment_original_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, status`,
      [studentId, category_id, title, description, attachmentPath, attachmentOriginalName]
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
    if (req.file) fs.unlinkSync(req.file.path);
    renderSubmitError(req, res, 'Something went wrong. Please try again.');
  }
});

// Small helper to avoid repeating the categories re-fetch + render in every error branch
async function renderSubmitError(req, res, text) {
  const categories = await pool.query('SELECT id, name FROM categories WHERE active = true ORDER BY name');
  res.render('student/submit', {
    categories: categories.rows,
    message: { type: 'error', text },
    formData: req.body,
  });
}

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

    const commentsResult = await pool.query(
      `SELECT c.*, u.full_name AS author_name
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.complaint_id = $1
       ORDER BY c.created_at ASC`,
      [complaintId]
    );

    res.render('student/complaint-details', {
      complaint: result.rows[0],
      comments: commentsResult.rows,
      submitted: req.query.submitted === '1',
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load the complaint.' });
  }
});

// Post a comment on my own complaint
router.post('/complaints/:id/comments', async (req, res) => {
  const studentId = req.session.user.id;
  const complaintId = req.params.id;
  const message = req.body.message ? req.body.message.trim().slice(0, 1000) : '';

  if (!message) {
    return res.redirect(`/student/complaints/${complaintId}`);
  }

  try {
    // Confirm this complaint actually belongs to this student before allowing a comment
    const ownsIt = await pool.query(
      'SELECT id FROM complaints WHERE id = $1 AND student_id = $2',
      [complaintId, studentId]
    );

    if (ownsIt.rows.length === 0) {
      return res.status(404).render('error', { title: 'Not Found', message: 'That complaint does not exist or does not belong to you.' });
    }

    await pool.query(
      `INSERT INTO comments (complaint_id, author_id, author_role, message)
       VALUES ($1, $2, 'student', $3)`,
      [complaintId, studentId, message]
    );

    res.redirect(`/student/complaints/${complaintId}#comment-list`);
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not post your comment.' });
  }
});

// Download an attachment — only if it belongs to the logged-in student
router.get('/complaints/:id/attachment', async (req, res) => {
  const studentId = req.session.user.id;
  const complaintId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT attachment_path, attachment_original_name
       FROM complaints
       WHERE id = $1 AND student_id = $2`,
      [complaintId, studentId]
    );

    if (result.rows.length === 0 || !result.rows[0].attachment_path) {
      return res.status(404).render('error', {
        title: 'Not Found',
        message: 'No attachment found for that complaint.',
      });
    }

    const { attachment_path, attachment_original_name } = result.rows[0];
    const fullPath = path.join(__dirname, '..', 'uploads', attachment_path);

    res.download(fullPath, attachment_original_name);
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not download the file.' });
  }
});

module.exports = router;