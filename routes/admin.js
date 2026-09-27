const express = require('express');
const path = require('path');
const { requireAdmin } = require('../middleware/auth');
const pool = require('../db');
const router = express.Router();

router.use(requireAdmin);

// Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const countsResult = await pool.query(
      `SELECT status, COUNT(*) AS count FROM complaints GROUP BY status`
    );
    const counts = {};
    countsResult.rows.forEach(row => {
      counts[row.status] = parseInt(row.count, 10);
    });

    const recentResult = await pool.query(
      `SELECT c.id, c.title, c.status, u.full_name AS student_name
       FROM complaints c
       JOIN users u ON u.id = c.student_id
       ORDER BY c.created_at DESC
       LIMIT 5`
    );

    res.render('admin/dashboard', { counts, recentComplaints: recentResult.rows });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load the dashboard.' });
  }
});

// All complaints, with search/filter
router.get('/complaints', async (req, res) => {
  const { search = '', status = '', category_id = '' } = req.query;

  try {
    const categories = await pool.query('SELECT id, name FROM categories ORDER BY name');

    // Build the WHERE clause dynamically, but always with parameterized values
    const conditions = [];
    const values = [];

    if (search.trim()) {
      values.push(`%${search.trim()}%`);
      conditions.push(`c.title ILIKE $${values.length}`);
    }
    if (status) {
      values.push(status);
      conditions.push(`c.status = $${values.length}`);
    }
    if (category_id) {
      values.push(category_id);
      conditions.push(`c.category_id = $${values.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT c.id, c.title, c.status, c.created_at, cat.name AS category_name, u.full_name AS student_name
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       JOIN users u ON u.id = c.student_id
       ${whereClause}
       ORDER BY c.created_at DESC`,
      values
    );

    res.render('admin/all-complaints', {
      complaints: result.rows,
      categories: categories.rows,
      filters: { search, status, category_id },
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load complaints.' });
  }
});

// Complaint details (no ownership check — admins see everyone's)
router.get('/complaints/:id', async (req, res) => {
  const complaintId = req.params.id;

  try {
    const complaintResult = await pool.query(
      `SELECT c.*, cat.name AS category_name,
              u.full_name AS student_name, u.email AS student_email, u.student_id_number
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       JOIN users u ON u.id = c.student_id
       WHERE c.id = $1`,
      [complaintId]
    );

    if (complaintResult.rows.length === 0) {
      return res.status(404).render('error', { title: 'Not Found', message: 'That complaint does not exist.' });
    }

    const historyResult = await pool.query(
      `SELECT h.*, u.full_name AS changed_by_name
       FROM complaint_history h
       JOIN users u ON u.id = h.changed_by
       WHERE h.complaint_id = $1
       ORDER BY h.created_at ASC`,
      [complaintId]
    );

    res.render('admin/complaint-details', {
      complaint: complaintResult.rows[0],
      history: historyResult.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load the complaint.' });
  }
});

// Download an attachment — any admin can access any complaint's file
router.get('/complaints/:id/attachment', async (req, res) => {
  const complaintId = req.params.id;

  try {
    const result = await pool.query(
      `SELECT attachment_path, attachment_original_name FROM complaints WHERE id = $1`,
      [complaintId]
    );

    if (result.rows.length === 0 || !result.rows[0].attachment_path) {
      return res.status(404).render('error', { title: 'Not Found', message: 'No attachment found.' });
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