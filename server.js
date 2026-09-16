require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');

const User = require('./models/User');
const Service = require('./models/Service');

const app = express();
mongoose.connect(process.env.MONGO_URI);

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.send('<form method="POST" action="/login"><input type="password" name="password"/><button type="submit">Login</button></form>');
});

app.post('/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else res.send('Wrong Password');
});

app.get('/admin', (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/login');
  res.send('<h1>👑 Admin Dashboard</h1><p>Welcome Master Admin!</p>');
});

app.listen(process.env.PORT || 3000, () => console.log("Admin Server Running"));
