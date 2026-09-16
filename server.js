require('./bot.js');
require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// এডমিন অথোরাইজেশন মিডলওয়্যার
const verifyAdmin = (req, res, next) => {
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  if (adminKey === process.env.ADMIN_ID) {
    next();
  } else {
    res.status(403).json({ error: "Access Denied! Invalid Admin Key." });
  }
};

// সার্ভার রেন্ডার চেক রুট
app.get('/', (req, res) => {
  res.send('OTP Bot Admin & Backend Server is Live!');
});

// ১. এডমিন ড্যাশবোর্ড ও লাইভ ট্রাফিক কন্ট্রোল
app.get('/admin/dashboard', verifyAdmin, (req, res) => {
  res.json({ status: "success", message: "Admin Dashboard Live Traffic & Statistics" });
});

// ২. ব্রডকাস্ট সিস্টেম (সকল ইউজারের কাছে নোটিফিকেশন পাঠানোর জন্য)
app.post('/admin/broadcast', verifyAdmin, (req, res) => {
  const { message } = req.body;
  res.json({ status: "success", message: "Broadcast initiated successfully.", content: message });
});

// ৩. চ্যানেল, গ্রুপ ও সাপোর্ট এডমিন ম্যানেজমেন্ট (ফোর্স সাবস্ক্রাইব কন্ট্রোল)
app.post('/admin/channels', verifyAdmin, (req, res) => {
  const { channelName, channelUrl, action } = req.body; // action: add, remove
  res.json({ status: "success", channelName, channelUrl, action, message: "Forced channels updated successfully." });
});

// ৪. ইউজার একাউন্ট ও ব্যালেন্স ম্যানেজমেন্ট (সাসপেন্ড, ডিলিট, ব্যালেন্স এডিট)
app.post('/admin/user-manage', verifyAdmin, (req, res) => {
  const { userId, action, balance } = req.body; 
  res.json({ status: "success", userId, action, balance, message: "User account updated." });
});

// ৫. নাম্বার, কান্ট্রি, লোগো এবং প্রাইসিং কনফিগারেশন
app.post('/admin/configure-numbers', verifyAdmin, (req, res) => {
  const { country, service, range, price, flagLogo } = req.body;
  res.json({ status: "success", country, service, range, price, flagLogo, message: "Number configurations updated." });
});

// ৬. ওয়েবসাইট ও বট ফিচার বা বাটন লেআউট চেঞ্জ কন্ট্রোল
app.post('/admin/update-features', verifyAdmin, (req, res) => {
  const { featureName, buttonText, status } = req.body;
  res.json({ status: "success", featureName, buttonText, status, message: "Bot features and layouts updated." });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Admin Server running on port ${PORT}`);
});
