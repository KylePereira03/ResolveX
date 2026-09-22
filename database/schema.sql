-- USERS
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'admin')),
  student_id_number VARCHAR(50),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- CATEGORIES
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- COMPLAINTS
CREATE TABLE complaints (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id),
  category_id INT NOT NULL REFERENCES categories(id),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  attachment_path VARCHAR(500),
  attachment_original_name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'Submitted'
    CHECK (status IN ('Submitted', 'Under Review', 'In Progress', 'Resolved')),
  admin_response TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- COMPLAINT HISTORY
CREATE TABLE complaint_history (
  id SERIAL PRIMARY KEY,
  complaint_id INT NOT NULL REFERENCES complaints(id),
  changed_by INT NOT NULL REFERENCES users(id),
  old_status VARCHAR(20),
  new_status VARCHAR(20) NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Helpful indexes for filtering/searching later
CREATE INDEX idx_complaints_student_id ON complaints(student_id);
CREATE INDEX idx_complaints_status ON complaints(status);
CREATE INDEX idx_complaint_history_complaint_id ON complaint_history(complaint_id);