const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Database connected successfully.'))
  .catch(err => console.error('Database connection error:', err));

const User = require('./models/User');
const Settings = require('./models/Settings');

// Admin Login Middleware
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';

app.get('/admin', async (req, res) => {
  const pass = req.query.pass;
  if (pass !== ADMIN_PASS) {
    return res.send(`<h2>Unauthorized! Please provide correct password in URL like: /admin?pass=your_password</h2>`);
  }

  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: { $in: ['Active', 'Working'] } });
    const users = await User.find({});
    const settings = await Settings.findOne() || { otpRate: 1.0, channelLink: '', topMessageText: '' };

    res.render('dashboard', { totalUsers, activeUsers, users, settings, pass });
  } catch (error) {
    res.status(500).send('Error loading dashboard: ' + error.message);
  }
});

// Admin Update Settings
app.post('/api/admin/settings', async (req, res) => {
  try {
    const { otpRate, channelLink, topMessageText } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({ otpRate, channelLink, topMessageText });
    } else {
      settings.otpRate = otpRate;
      settings.channelLink = channelLink;
      settings.topMessageText = topMessageText;
    }
    await settings.save();
    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Start Telegram Bot
require('./bot');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
