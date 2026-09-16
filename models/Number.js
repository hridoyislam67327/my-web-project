const mongoose = require('mongoose');

const activeNumberSchema = new mongoose.Schema({
  telegramId: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  service: { type: String, required: true },
  country: { type: String, required: true },
  orderId: { type: String, required: true },
  otpCode: { type: String, default: null },
  fullMessage: { type: String, default: null },
  status: { type: String, enum: ['WAITING', 'RECEIVED', 'CANCELLED'], default: 'WAITING' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.models.ActiveNumber || mongoose.model('ActiveNumber', activeNumberSchema);
