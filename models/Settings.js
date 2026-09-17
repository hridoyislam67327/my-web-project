const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    otpRate: {
      type: Number,
      default: 1.0,
      min: 0
    },

    channelLink: {
      type: String,
      default: 'https://t.me/Mathod_Channel',
      trim: true
    },

    channelUsername: {
      type: String,
      default: '@Mathod_Channel',
      trim: true
    },

    topMessageText: {
      type: String,
      default: 'স্বাগতম আমাদের ওটিপি বটে!',
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Settings', settingsSchema);
