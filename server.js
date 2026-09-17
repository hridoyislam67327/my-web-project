require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// ===============================
// Environment
// ===============================

const PORT = Number(process.env.PORT) || 3000;
const MONGO_URI = process.env.MONGO_URI;
const ADMIN_PASS = process.env.ADMIN_PASS;

if (!MONGO_URI) {
  throw new Error('❌ MONGO_URI is missing.');
}

if (!ADMIN_PASS) {
  throw new Error('❌ ADMIN_PASS is missing.');
}

// ===============================
// Middleware
// ===============================

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.use(express.static('public'));

// ===============================
// Models
// ===============================

const User = require('./models/User');
const Settings = require('./models/Settings');

// ===============================
// Admin Authentication
// ===============================

function adminAuth(req, res, next) {
  const pass = req.headers['x-admin-password'];

  if (!pass || pass !== ADMIN_PASS) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  next();
}

// ===============================
// Admin Dashboard
// ===============================

app.get('/admin', async (req, res) => {
  try {
    const pass = req.query.pass;

    if (!pass || pass !== ADMIN_PASS) {
      return res.status(401).send('<h2>Unauthorized</h2>');
    }

    const [
      totalUsers,
      activeUsers,
      users,
      settings
    ] = await Promise.all([
      User.countDocuments(),

      User.countDocuments({
        status: {
          $in: ['Active', 'Working']
        }
      }),

      User.find({})
        .sort({ _id: -1 })
        .lean(),

      Settings.findOne().lean()
    ]);

    const safeSettings = settings || {
      otpRate: 1,
      channelLink: '',
      channelUsername: '',
      topMessageText: 'স্বাগতম আমাদের বটে!'
    };

    res.render('dashboard', {
      totalUsers,
      activeUsers,
      users,
      settings: safeSettings
    });

  } catch (error) {
    console.error('❌ ADMIN DASHBOARD ERROR:', error);

    res.status(500).send(
      'Error loading dashboard.'
    );
  }
});

// ===============================
// Update Settings
// ===============================

app.post('/api/admin/settings', adminAuth, async (req, res) => {
  try {
    let {
      otpRate,
      channelLink,
      channelUsername,
      topMessageText
    } = req.body;

    otpRate = Number(otpRate);

    if (!Number.isFinite(otpRate) || otpRate < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP rate.'
      });
    }

    channelLink =
      typeof channelLink === 'string'
        ? channelLink.trim()
        : '';

    channelUsername =
      typeof channelUsername === 'string'
        ? channelUsername.trim()
        : '';

    topMessageText =
      typeof topMessageText === 'string'
        ? topMessageText.trim()
        : '';

    let settings = await Settings.findOne();

    if (!settings) {
      settings = new Settings({
        otpRate,
        channelLink,
        channelUsername,
        topMessageText
      });
    } else {
      settings.otpRate = otpRate;
      settings.channelLink = channelLink;
      settings.channelUsername = channelUsername;
      settings.topMessageText = topMessageText;
    }

    await settings.save();

    res.json({
      success: true,
      message: 'Settings updated successfully.'
    });

  } catch (error) {
    console.error('❌ SETTINGS UPDATE ERROR:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to update settings.'
    });
  }
});

// ===============================
// Health Check
// ===============================

app.get('/health', (req, res) => {
  const dbConnected =
    mongoose.connection.readyState === 1;

  res.json({
    success: true,
    server: 'online',
    database: dbConnected
      ? 'connected'
      : 'disconnected'
  });
});

// ===============================
// Start Everything
// ===============================

async function startServer() {
  try {

    // Connect MongoDB first
    await mongoose.connect(MONGO_URI);

    console.log('✅ MongoDB connected successfully.');

    // Start Telegram bot after DB connection
    try {
      require('./bot');

      console.log(
        '✅ Telegram bot module loaded.'
      );
    } catch (error) {
      console.error(
        '❌ Telegram bot failed to start:',
        error
      );
    }

    // Start Express server
    app.listen(PORT, () => {
      console.log(
        `🚀 Server running on port ${PORT}`
      );
    });

  } catch (error) {
    console.error(
      '❌ MongoDB connection failed:',
      error.message
    );

    process.exit(1);
  }
}

// ===============================
// Error Handling
// ===============================

process.on('unhandledRejection', (reason) => {
  console.error(
    '❌ Unhandled Promise Rejection:',
    reason
  );
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down...');

  await mongoose.connection.close();

  process.exit(0);
});

// ===============================
// Run
// ===============================

startServer();
