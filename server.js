require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/User');
const Service = require('./models/Service');
const ActiveNumber = require('./models/Number');
const Settings = require('./models/Settings');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected for Admin Server'))
  .catch(err => console.error('MongoDB Admin Error:', err));

// Admin Auth Middleware
const isAdmin = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'] || req.query.admin_key;
  if (adminKey === process.env.ADMIN_SECRET_KEY) {
    next();
  } else {
    res.status(403).json({ success: false, message: "Unauthorized access!" });
  }
};

// ১. ড্যাশবোর্ড ওভারভিউ ও স্ট্যাটস
app.get('/admin/stats', isAdmin, async (req, res) => {
  const totalUsers = await User.countDocuments();
  const bannedUsers = await User.countDocuments({ isBanned: true });
  const activeNumbers = await ActiveNumber.countDocuments({ status: 'WAITING' });
  const totalOrders = await ActiveNumber.countDocuments();
  
  res.json({ success: true, totalUsers, bannedUsers, activeNumbers, totalOrders });
});

// ২. ইউজার ব্যালেন্স এডিট ও ব্যান/আনব্যান (User Management)
app.post('/admin/user/update', isAdmin, async (req, res) => {
  const { telegramId, balance, isBanned, resetState } = req.body;
  
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ success: false, message: "User not found!" });

  if (balance !== undefined) user.balance = parseFloat(balance);
  if (isBanned !== undefined) user.isBanned = isBanned;
  await user.save();

  // ইউজার অ্যাকাউন্টে কোনো ঝামেলা হলে একটিভ সার্ভিস রিসেট
  if (resetState) {
    await ActiveNumber.updateMany({ telegramId, status: 'WAITING' }, { status: 'CANCELLED' });
  }

  res.json({ success: true, message: `User ${telegramId} updated successfully!`, user });
});

// ৩. মেসেজ ডিজাইন ও সেটিংস আপডেট
app.post('/admin/settings/update', isAdmin, async (req, res) => {
  const { otpGroupLink, numberCardTemplate, codeFoundTemplate, codeNotFoundTemplate } = req.body;
  
  let settings = await Settings.findOne();
  if (!settings) settings = new Settings();

  if (otpGroupLink) settings.otpGroupLink = otpGroupLink;
  if (numberCardTemplate) settings.numberCardTemplate = numberCardTemplate;
  if (codeFoundTemplate) settings.codeFoundTemplate = codeFoundTemplate;
  if (codeNotFoundTemplate) settings.codeNotFoundTemplate = codeNotFoundTemplate;

  await settings.save();
  res.json({ success: true, message: "Message design and settings updated!", settings });
});

// ৪. ব্রডকাস্ট নোটিশ এনজিকেশন
app.post('/admin/broadcast', isAdmin, async (req, res) => {
  const { message } = req.body;
  const users = await User.find({ isBanned: false });

  // বটের মাধ্যমে মেসেজ পাঠানোর লজিক এপিআই এন্ডপয়েন্ট
  res.json({ success: true, totalTargetUsers: users.length, message: "Broadcast initiated!" });
});

// ৫. সার্ভিস ও নাম্বার রেঞ্জ এডিট/এড
app.post('/admin/service/add-edit', isAdmin, async (req, res) => {
  const { categoryKey, country, countryCode, price, flagEmoji, active } = req.body;

  let service = await Service.findOne({ categoryKey, countryCode });
  if (service) {
    service.price = price;
    service.flagEmoji = flagEmoji;
    service.active = active;
    await service.save();
  } else {
    service = await Service.create({ categoryKey, country, countryCode, price, flagEmoji, active });
  }

  res.json({ success: true, message: "Service updated successfully!", service });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Admin Server is running on port ${PORT}`));
