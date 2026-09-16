const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  categoryKey: { type: String, required: true },
  country: { type: String, required: true },
  countryCode: { type: String, required: true },
  flagEmoji: { type: String, default: '🌐' },
  price: { type: Number, required: true },
  active: { type: Boolean, default: true }
});

module.exports = mongoose.model('Service', serviceSchema);
