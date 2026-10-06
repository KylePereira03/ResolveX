// Must be logged in as anyone (student or admin)
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// Must be logged in specifically as a student
function requireStudent(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'student') {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'This page is only available to students.',
    });
  }
  next();
}

// Must be logged in specifically as an admin
function requireAdmin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/admin/login');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'This page is only available to administrators.',
    });
  }
  next();
}

// Super admins get no restriction; department admins only see their own category.
function getDepartmentFilter(adminUser, startingParamIndex) {
  if (adminUser.admin_level === 'super') {
    return { clause: '', values: [] };
  }
  return {
    clause: `AND cat.name = $${startingParamIndex}`,
    values: [adminUser.department],
  };
}

module.exports = { requireLogin, requireStudent, requireAdmin, getDepartmentFilter };