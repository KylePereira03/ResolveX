require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Tell Express we'll use EJS templates, stored in the "views" folder
app.set('view engine', 'ejs');

// Serve files in the "public" folder (CSS, images) directly
app.use(express.static('public'));

// Temporary test route (we'll replace this later)
app.get('/', (req, res) => {
  res.send('Hello! The Complaint Management System server is running.');
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});