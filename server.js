require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// EJS View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI is missing in Environment Variables!');
} else {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Database connected successfully in server.js'))
    .catch(err => console.error('❌ Database connection error:', err.message));
}

// Schemas & Models
const settingsSchema = new mongoose.Schema({
  otpRate: { type: Number, default: 1.0 }
});
const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, required: true },
  username: String,
  balance: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Banned', 'Working'], default: 'Active' },
  lastActive: { type: Date, default: Date.now }
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const numberRangeSchema = new mongoose.Schema({
  country: { type: String, required: true },
  prefix: { type: String, required: true },
  ranges: [String],
  status: { type: String, default: 'Active' }
});
const NumberRange = mongoose.models.NumberRange || mongoose.model('NumberRange', numberRangeSchema);

// Import & Start Telegram Bot
try {
  require('./bot');
  console.log('🤖 Telegram Bot script loaded successfully.');
} catch (botErr) {
  console.error('❌ Failed to load bot.js:', botErr.message);
}

// Render Admin Dashboard Page
app.get('/', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const activeNumbers = await User.countDocuments({ status: { $in: ['Active', 'Working'] } });
    const users = await User.find({});
    res.render('dashboard', { userCount, activeNumbers, users });
  } catch (error) {
    res.status(500).send('Error loading dashboard: ' + error.message);
  }
});

// Admin Actions (Form Submissions)
app.post('/admin/user/balance', async (req, res) => {
  try {
    const { telegramId, amount } = req.body;
    await User.findOneAndUpdate(
      { telegramId },
      { $inc: { balance: parseFloat(amount) } }
    );
    res.redirect('/');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post('/admin/user/suspend', async (req, res) => {
  try {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (user) {
      user.status = user.status === 'Banned' ? 'Active' : 'Banned';
      await user.save();
    }
    res.redirect('/');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post('/admin/user/delete', async (req, res) => {
  try {
    const { telegramId } = req.body;
    await User.findOneAndDelete({ telegramId });
    res.redirect('/');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post('/admin/service/add', async (req, res) => {
  try {
    const { country, prefix, ranges } = req.body;
    const rangeArray = ranges.split(',').map(r => r.trim());
    const newRange = new NumberRange({ country, prefix, ranges: rangeArray });
    await newRange.save();
    res.redirect('/');
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post('/admin/broadcast', async (req, res) => {
  // Broadcast Logic Handle Here
  res.redirect('/');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
