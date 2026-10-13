const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const { requireAdmin, requireSuperAdmin, getDepartmentFilter } = require('../middleware/auth');
const pool = require('../db');
const router = express.Router();

router.use(requireAdmin);

// Dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const deptFilter = getDepartmentFilter(req.session.user, 1);

    const countsResult = await pool.query(
      `SELECT c.status, COUNT(*) AS count
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       WHERE 1=1 ${deptFilter.clause}
       GROUP BY c.status`,
      deptFilter.values
    );
    const counts = {};
    countsResult.rows.forEach(row => {
      counts[row.status] = parseInt(row.count, 10);
    });

    const recentResult = await pool.query(
      `SELECT c.id, c.title, c.status, u.full_name AS student_name
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       JOIN users u ON u.id = c.student_id
       WHERE 1=1 ${deptFilter.clause}
       ORDER BY c.created_at DESC
       LIMIT 5`,
      deptFilter.values
    );

    res.render('admin/dashboard', {
      counts,
      recentComplaints: recentResult.rows,
      isSuperAdmin: req.session.user.admin_level === 'super',
    });
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
    if (req.session.user.admin_level !== 'super') {
      values.push(req.session.user.department);
      conditions.push(`cat.name = $${values.length}`);
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

    const complaint = complaintResult.rows[0];
    const isSuperAdmin = req.session.user.admin_level === 'super';

    if (!isSuperAdmin && complaint.category_name !== req.session.user.department) {
      return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'This complaint belongs to a different department.',
      });
    }

    const historyResult = await pool.query(
      `SELECT h.*, u.full_name AS changed_by_name
       FROM complaint_history h
       JOIN users u ON u.id = h.changed_by
       WHERE h.complaint_id = $1
       ORDER BY h.created_at ASC`,
      [complaintId]
    );

    const commentsResult = await pool.query(
      `SELECT c.*, u.full_name AS author_name
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.complaint_id = $1
       ORDER BY c.created_at ASC`,
      [complaintId]
    );

    res.render('admin/complaint-details', {
      complaint,
      history: historyResult.rows,
      comments: commentsResult.rows,
      message: req.query.updated === '1' ? { type: 'success', text: 'Complaint updated successfully.' } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load the complaint.' });
  }
});

// Post a comment as admin
router.post('/complaints/:id/comments', async (req, res) => {
  const adminId = req.session.user.id;
  const complaintId = req.params.id;
  const message = req.body.message ? req.body.message.trim().slice(0, 1000) : '';

  if (!message) {
    return res.redirect(`/admin/complaints/${complaintId}`);
  }

  try {
    const exists = await pool.query(
      `SELECT c.id, cat.name AS category_name
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       WHERE c.id = $1`,
      [complaintId]
    );
    if (exists.rows.length === 0) {
      return res.status(404).render('error', { title: 'Not Found', message: 'That complaint does not exist.' });
    }

    const isSuperAdmin = req.session.user.admin_level === 'super';
    if (!isSuperAdmin && exists.rows[0].category_name !== req.session.user.department) {
      return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'This complaint belongs to a different department.',
      });
    }

    await pool.query(
      `INSERT INTO comments (complaint_id, author_id, author_role, message)
       VALUES ($1, $2, 'admin', $3)`,
      [complaintId, adminId, message]
    );

    res.redirect(`/admin/complaints/${complaintId}#comment-list`);
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not post your comment.' });
  }
});

// Update status and/or response
router.post('/complaints/:id/update', async (req, res) => {
  const complaintId = req.params.id;
  const adminId = req.session.user.id;
  const { status, admin_response } = req.body;

  const validStatuses = ['Submitted', 'Under Review', 'In Progress', 'Resolved'];
  if (!validStatuses.includes(status)) {
    return res.status(400).render('error', { title: 'Invalid Status', message: 'That status is not recognized.' });
  }

  try {
    // Get the current status first, so we know if it's actually changing
    const current = await pool.query(
      `SELECT c.status, cat.name AS category_name
       FROM complaints c
       JOIN categories cat ON cat.id = c.category_id
       WHERE c.id = $1`,
      [complaintId]
    );

    if (current.rows.length === 0) {
      return res.status(404).render('error', { title: 'Not Found', message: 'That complaint does not exist.' });
    }

    const isSuperAdmin = req.session.user.admin_level === 'super';
    if (!isSuperAdmin && current.rows[0].category_name !== req.session.user.department) {
      return res.status(403).render('error', {
        title: 'Access Denied',
        message: 'This complaint belongs to a different department.',
      });
    }

    const oldStatus = current.rows[0].status;

    // Update the complaint itself
    await pool.query(
      `UPDATE complaints
       SET status = $1, admin_response = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, admin_response || null, complaintId]
    );

    // Record this change in history — even if only the response changed, not the status
    await pool.query(
      `INSERT INTO complaint_history (complaint_id, changed_by, old_status, new_status, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        complaintId,
        adminId,
        oldStatus,
        status,
        admin_response ? admin_response : (oldStatus === status ? 'Response updated.' : 'Status updated.'),
      ]
    );

    res.redirect(`/admin/complaints/${complaintId}?updated=1`);
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not update the complaint.' });
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

// List all admins + the create form (super admin only)
router.get('/manage/admins', requireSuperAdmin, async (req, res) => {
  try {
    const admins = await pool.query(
      `SELECT full_name, email, department, admin_level
       FROM users
       WHERE role = 'admin'
       ORDER BY admin_level DESC, department ASC NULLS FIRST`
    );
    const categories = await pool.query('SELECT id, name FROM categories WHERE active = true ORDER BY name');

    res.render('admin/manage-admins', {
      admins: admins.rows,
      categories: categories.rows,
      message: req.query.created === '1' ? { type: 'success', text: 'Admin created successfully.' } : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load admins.' });
  }
});

// Create a new department admin (super admin only)
router.post('/manage/admins', requireSuperAdmin, async (req, res) => {
  const { full_name, email: rawEmail, department, password } = req.body;
  const email = rawEmail ? rawEmail.trim().toLowerCase() : '';

  const categories = await pool.query('SELECT id, name FROM categories WHERE active = true ORDER BY name');

  if (!full_name || !email || !department || !password) {
    return renderManageError(req, res, categories.rows, 'All fields are required.');
  }
  if (password.length < 6) {
    return renderManageError(req, res, categories.rows, 'Password must be at least 6 characters.');
  }

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return renderManageError(req, res, categories.rows, 'That email is already in use.');
    }

    const password_hash = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, department, admin_level)
       VALUES ($1, $2, $3, 'admin', $4, 'department')`,
      [full_name, email, password_hash, department]
    );

    res.redirect('/admin/manage/admins?created=1');
  } catch (err) {
    console.error(err);
    renderManageError(req, res, categories.rows, 'Something went wrong. Please try again.');
  }
});

// Helper for re-rendering the manage-admins page with an error
async function renderManageError(req, res, categoriesRows, text) {
  const admins = await pool.query(
    `SELECT full_name, email, department, admin_level
     FROM users
     WHERE role = 'admin'
     ORDER BY admin_level DESC, department ASC NULLS FIRST`
  );
  res.render('admin/manage-admins', {
    admins: admins.rows,
    categories: categoriesRows,
    message: { type: 'error', text },
    formData: req.body,
  });
}

module.exports = router;