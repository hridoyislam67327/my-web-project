const mongoose = require('mongoose');
const numberRangeSchema = new mongoose.Schema({
  country: { type: String, required: true },
  prefix: { type: String, required: true },
  ranges: [String],
  status: { type: String, default: 'Active' }
});
module.exports = mongoose.model('NumberRange', numberRangeSchema);
