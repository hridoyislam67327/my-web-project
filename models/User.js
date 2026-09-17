const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    telegramId: {
      type: String,
      unique: true,
      required: true,
      trim: true
    },

    username: {
      type: String,
      default: '',
      trim: true
    },

    balance: {
      type: Number,
      default: 0,
      min: 0
    },

    status: {
      type: String,
      enum: ['Active', 'Banned', 'Working'],
      default: 'Active'
    },

    lastActive: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('User', userSchema);
