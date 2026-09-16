const mongoose = require('mongoose');
const settingsSchema = new mongoose.Schema({
  otpRate: { type: Number, default: 1.0 },
  channelLink: { type: String, default: 'https://t.me/your_channel' },
  topMessageText: { type: String, default: 'স্বাগতম আমাদের ওটিপি বটে!' }
});
module.exports = mongoose.model('Settings', settingsSchema);
