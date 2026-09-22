require('dotenv').config();
const express = require('express');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));

// Temporary test route — confirms the DB connection works
app.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT name FROM categories ORDER BY name');
    res.send('Connected! Categories: ' + result.rows.map(r => r.name).join(', '));
  } catch (err) {
    console.error(err);
    res.status(500).send('Database connection failed.');
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});