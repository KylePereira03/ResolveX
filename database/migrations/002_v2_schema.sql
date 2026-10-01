-- Add department scoping to users
ALTER TABLE users ADD COLUMN department VARCHAR(100);
ALTER TABLE users ADD COLUMN admin_level VARCHAR(20) CHECK (admin_level IN ('department', 'super'));

-- Comments table
CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  complaint_id INT NOT NULL REFERENCES complaints(id),
  author_id INT NOT NULL REFERENCES users(id),
  author_role VARCHAR(20) NOT NULL CHECK (author_role IN ('student', 'admin')),
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_complaint_id ON comments(complaint_id);

-- Promote the existing admin to super_admin and set a new password
-- Replace the hash below with the one you generated in Step 1
UPDATE users
SET admin_level = 'super',
    password_hash = '$2b$10$bDqzLiaq0gn56JqzIs3HxesVDqNCEuDm5/2HwuL06iTDnh0LsZpDW'
WHERE email = 'admin@college.edu' AND role = 'admin';