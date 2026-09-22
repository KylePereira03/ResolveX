-- Categories
INSERT INTO categories (name) VALUES
  ('Academics'),
  ('Infrastructure'),
  ('IT/Technical'),
  ('Hostel'),
  ('Library'),
  ('Administration'),
  ('Other');

-- One admin account
-- Password below is the bcrypt hash of: admin123
INSERT INTO users (full_name, email, password_hash, role)
VALUES (
  'System Admin',
  'admin@college.edu',
  '$2b$10$KMmEQ78dEKUJOdU7w09AXurMzljnt.MMbTs4eiQ3xgrdMMudhV6Hm',
  'admin'
);