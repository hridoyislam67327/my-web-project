const mongoose = require('mongoose');

module.exports = mongoose.model('User', new mongoose.Schema({
  telegramId: String,
  username: String,
  firstName: String,
  balance: { type: Number, default: 0 },
  isSuspended: { type: Boolean, default: false }
}));
