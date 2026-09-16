const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  otpGroupLink: { type: String, default: "https://t.me/your_otp_group" },
  numberCardTemplate: {
    type: String,
    default: "**Number Assigned Successfully !**\n\n**Country :** {flag} {country}\n**Number :** `{number}`\n\n> Code will be received automatically here. ❞"
  },
  codeFoundTemplate: {
    type: String,
    default: "✅ **Code Found**\n\n🈳 `{number}`"
  },
  codeNotFoundTemplate: {
    type: String,
    default: "❌ **Code not found**\n🈳 `+{number}`"
  }
});

module.exports = mongoose.model('Settings', settingsSchema);
