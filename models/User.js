const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, required: true },
  username: String,
  balance: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Banned', 'Working'], default: 'Active' },
  lastActive: { type: Date, default: Date.now }
});
module.exports = mongoose.model('User', userSchema);
