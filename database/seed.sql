-- Categories
INSERT INTO categories (name) VALUES
  ('Academics'),
  ('Infrastructure'),
  ('IT/Technical'),
  ('Hostel'),
  ('Library'),
  ('Administration'),
  ('Other');

INSERT INTO users (full_name, email, password_hash, role, admin_level)
VALUES (
  'System Admin',
  'admin@college.edu',
  '$2b$10$PAHy7hxi84HKscS.BGugSeHsPwUCoa4wVHYiipSdumwciBtdgcf2q',
  'admin',
  'super'
);