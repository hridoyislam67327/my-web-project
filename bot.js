require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');

const User = require('./models/User');
const ActiveNumber = require('./models/Number');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected for Bot'))
  .catch(err => console.error('MongoDB Error:', err));

// ১. /start কমান্ড
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  let user = await User.findOne({ telegramId });
  if (!user) {
    user = await User.create({
      telegramId,
      username: msg.from.username,
      firstName: msg.from.first_name,
      balance: 0
    });
  }

  if (user.isSuspended) {
    return bot.sendMessage(chatId, "❌ আপনার অ্যাকাউন্টটি সাময়িকভাবে স্থগিত করা হয়েছে।");
  }

  sendMainMenu(chatId);
});

// ২. মেইন মেনু (আপনার প্যানেল থেকে সার্ভিস ফেচ করার সঠিক পদ্ধতি)
async function sendMainMenu(chatId, messageId = null) {
  try {
    // সরাসরি .env এর API_URL এবং API_KEY দিয়ে রিকোয়েস্ট পাঠানো
    const response = await axios.get(`${process.env.API_URL}`, {
      params: {
        api_key: process.env.API_KEY,
        action: 'services' // বেশিরভাগ প্যানেলের স্ট্যান্ডার্ড অ্যাকশন
      }
    });

    // প্যানেল থেকে ডাটা অ্যারে বা অবজেক্ট আকারে আসতে পারে
    const servicesData = response.data.services || response.data;
    
    const keyboard = [];
    let row = [];

    // যদি ডেটা অবজেক্ট বা অ্যারে হয় সে অনুযায়ী হ্যান্ডেল করা
    const serviceKeys = Array.isArray(servicesData) ? servicesData : Object.keys(servicesData);

    serviceKeys.slice(0, 10).forEach((srv, index) => {
      const srvName = typeof srv === 'string' ? srv : (srv.name || srv.code);
      row.push({ text: `🔹 ${srvName.toUpperCase()}`, callback_data: `service_${srvName}` });
      if (row.length === 2 || index === serviceKeys.length - 1) {
        keyboard.push(row);
        row = [];
      }
    });

    const menuOptions = { reply_markup: { inline_keyboard: keyboard } };

    if (messageId) {
      bot.editMessageText("📌 আপনার প্যানেল থেকে উপলব্ধ সার্ভিসসমূহ:", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        ...menuOptions
      });
    } else {
      bot.sendMessage(chatId, "📌 আপনার প্যানেল থেকে উপলব্ধ সার্ভিসসমূহ:", {
        parse_mode: 'Markdown',
        ...menuOptions
      });
    }
  } catch (error) {
    console.error("Panel API Error:", error.response?.data || error.message);
    const errorText = "❌ প্যানেল থেকে সার্ভিস লোড করতে সমস্যা হয়েছে। `.env` ফাইলের `API_URL` এবং `API_KEY` সঠিক আছে কি না চেক করুন।";
    if (messageId) {
      bot.editMessageText(errorText, { chat_id: chatId, message_id: messageId });
    } else {
      bot.sendMessage(chatId, errorText);
    }
  }
}

// ৩. ক্যালব্যাক ও নাম্বার জেনারেট হ্যান্ডেলার
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  if (data.startsWith('service_')) {
    const service = data.split('_')[1];

    try {
      // প্যানেল থেকে উক্ত সার্ভিসের জন্য কান্ট্রি বা প্রাইস লিস্ট আনা
      const res = await axios.get(`${process.env.API_URL}`, {
        params: {
          api_key: process.env.API_KEY,
          action: 'prices',
          service: service
        }
      });

      bot.editMessageText(`📌 সার্ভিস: **${service.toUpperCase()}**\n\nনাম্বার নিতে নিচের বাটনে ক্লিক করুন:`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "📱 Get Number Now", callback_data: `getnum_${service}` }],
            [{ text: "🔙 Back", callback_data: "back_to_menu" }]
          ]
        }
      });
    } catch (err) {
      bot.answerCallbackQuery(query.id, { text: "❌ প্যানেল থেকে কান্ট্রি লোড করা যায়নি!", show_alert: true });
    }
  }

  else if (data.startsWith('getnum_')) {
    const service = data.split('_')[1];
    const telegramId = query.from.id.toString();

    try {
      // প্যানেল থেকে সরাসরি রিয়েল নাম্বার নেওয়ার এপিআই কল
      const numRes = await axios.get(`${process.env.API_URL}`, {
        params: {
          api_key: process.env.API_KEY,
          action: 'getNumber',
          service: service
        }
      });

      const phoneNumber = numRes.data.number || numRes.data.phone;
      const orderId = numRes.data.id || numRes.data.orderId || "12345";

      if (!phoneNumber) {
        return bot.answerCallbackQuery(query.id, { text: "⚠️ এই মুহূর্তে কোনো নাম্বার খালি নেই!", show_alert: true });
      }

      await ActiveNumber.create({
        telegramId,
        phoneNumber,
        service,
        orderId,
        otpCode: "Waiting..."
      });

      bot.editMessageText(`✅ **সফলভাবে নাম্বার নেওয়া হয়েছে!**\n\n📱 নাম্বার: \`${phoneNumber}\``, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: "📩 Check OTP", callback_data: `checkotp_${orderId}` }],
            [{ text: "🔙 Main Menu", callback_data: "back_to_menu" }]
          ]
        }
      });

    } catch (error) {
      bot.answerCallbackQuery(query.id, { text: "❌ প্যানেল থেকে নাম্বার জেনারেট হয়নি!", show_alert: true });
    }
  }

  else if (data.startsWith('checkotp_')) {
    const orderId = data.split('_')[1];
    try {
      const statusRes = await axios.get(`${process.env.API_URL}`, {
        params: {
          api_key: process.env.API_KEY,
          action: 'getStatus',
          id: orderId
        }
      });
      const code = statusRes.data.code || statusRes.data.otp || "কোড এখনো আসেনি";
      bot.answerCallbackQuery(query.id, { text: `🔑 ওটিপি কোড: ${code}`, show_alert: true });
    } catch (err) {
      bot.answerCallbackQuery(query.id, { text: "⚠️ ওটিপি চেক করতে সমস্যা হয়েছে।", show_alert: true });
    }
    return;
  }

  else if (data === 'back_to_menu') {
    sendMainMenu(chatId, messageId);
  }

  bot.answerCallbackQuery(query.id);
});
