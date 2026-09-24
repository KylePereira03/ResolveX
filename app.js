require('dotenv').config();
const express = require('express');
const pool = require('./db');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true })); // parses form submissions into req.body

app.use('/', authRoutes);

app.get('/', (req, res) => {
  res.render('home', { user: null });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});