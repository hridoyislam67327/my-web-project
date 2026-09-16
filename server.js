require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');

// ১. টেলিগ্রাম বট প্রসেস চালু করা (এটি যুক্ত না করলে বট কাজ করবে না)
require('./bot.js');

const User = require('./models/User');
const Service = require('./models/Service');

const app = express();

// MongoDB Connection with Error Handling
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session Security Improvement
app.use(session({
  secret: process.env.SESSION_SECRET || 'otp_bot_secure_key_123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 day
}));

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.send(`
    <form method="POST" action="/login" style="margin:50px auto; width:200px;">
      <h3>Admin Login</h3>
      <input type="password" name="password" placeholder="Enter Password" required/>
      <button type="submit" style="margin-top:10px;">Login</button>
    </form>
  `);
});

app.post('/login', (req, res) => {
  if (req.body.password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    res.redirect('/admin');
  } else {
    res.send('Wrong Password! <a href="/login">Try Again</a>');
  }
});

app.get('/admin', (req, res) => {
  if (!req.session.isAdmin) return res.redirect('/login');
  res.send('<h1>👑 Admin Dashboard</h1><p>Welcome Master Admin!</p>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server & Bot are running on port ${PORT}`));
