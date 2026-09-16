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

// ১. /start কমান্ড ও মেইন মেনু
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

  // প্যানেল থেকে সার্ভিস লিস্ট ফেচ করা (অথবা আপনার প্যানেলের ক্যাটাগরি)
  sendMainMenu(chatId);
});

async function sendMainMenu(chatId, messageId = null) {
  try {
    // 🔴 আপনার প্যানেলের এপিআই থেকে সার্ভিস বা ক্যাটাগরি লিস্ট ফেচ করার রিকোয়েস্ট 
    // (আপনার এপিআই ডকুমেন্টেশন অনুযায়ী এখানে ইউআরএল ঠিক করে নিতে পারেন)
    const response = await axios.get(`${process.env.API_URL}?action=getServices&key=${process.env.API_KEY}`);
    const services = response.data.services || ['facebook', 'telegram', 'whatsapp', 'imo', 'instagram'];

    const keyboard = [];
    let row = [];
    
    services.forEach((service, index) => {
      row.push({ text: `🔹 ${service.toUpperCase()}`, callback_data: `service_${service}` });
      if (row.length === 2 || index === services.length - 1) {
        keyboard.push(row);
        row = [];
      }
    });

    const menuOptions = { reply_markup: { inline_keyboard: keyboard } };

    if (messageId) {
      bot.editMessageText("📌 আপনার প্যানেল থেকে প্রাপ্ত সার্ভিসসমূহ নিচে দেওয়া হলো:", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        ...menuOptions
      });
    } else {
      bot.sendMessage(chatId, "📌 আপনার প্যানেল থেকে প্রাপ্ত সার্ভিসসমূহ নিচে দেওয়া হলো:", {
        parse_mode: 'Markdown',
        ...menuOptions
      });
    }
  } catch (error) {
    console.error("API Error fetching services:", error.message);
    bot.sendMessage(chatId, "❌ প্যানেল থেকে সার্ভিস লোড করতে সমস্যা হয়েছে। এপিআই চেক করুন।");
  }
}

// ২. ইনলাইন বাটন ও ক্যালব্যাক হ্যান্ডেলার
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  // যখন কোনো সার্ভিস সিলেক্ট করা হবে, তখন প্যানেল থেকে ওই সার্ভিসের উপলব্ধ কান্ট্রি লিস্ট ফেচ করা হবে
  if (data.startsWith('service_')) {
    const service = data.split('_')[1];

    try {
      // 🔴 প্যানেল এপিআই থেকে কান্ট্রি লিস্ট আনার রিকোয়েস্ট
      const countryRes = await axios.get(`${process.env.API_URL}?action=getCountries&service=${service}&key=${process.env.API_KEY}`);
      const countries = countryRes.data.countries || [{ code: 'usa', name: 'USA' }, { code: 'uk', name: 'UK' }]; // ফলব্যাক

      const countryKeyboard = [];
      let row = [];

      countries.forEach((country, index) => {
        const countryName = country.name || country.toUpperCase();
        const countryCode = country.code || country;
        
        row.push({ text: `🌐 ${countryName}`, callback_data: `getnum_${service}_${countryCode}` });
        if (row.length === 2 || index === countries.length - 1) {
          countryKeyboard.push(row);
          row = [];
        }
      });

      countryKeyboard.push([{ text: "🔙 Back to Menu", callback_data: "back_to_menu" }]);

      bot.editMessageText(`📌 সার্ভিস: **${service.toUpperCase()}**\n\nআপনার প্যানেলে উপলব্ধ কান্ট্রিগুলো নিচে দেওয়া হলো:`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: countryKeyboard }
      });

    } catch (err) {
      console.error("Error fetching countries:", err.message);
      bot.answerCallbackQuery(query.id, { text: "❌ প্যানেল থেকে কান্ট্রি লোড করা যায়নি!", show_alert: true });
    }
  }

  // ৩. কান্ট্রি সিলেক্ট করার পর প্যানেল থেকে সরাসরি রিয়েল নাম্বার জেনারেট করা
  else if (data.startsWith('getnum_')) {
    const [, service, country] = data.split('_');
    const telegramId = query.from.id.toString();

    let assignedNumber = "";
    let orderId = "";

    try {
      // 🔴 আপনার প্যানেলের আসল এপিআই কল যা সরাসরি প্যানেল থেকে নাম্বার এনে দিবে
      const numberRes = await axios.get(`${process.env.API_URL}?action=getNumber&service=${service}&country=${country}&key=${process.env.API_KEY}`);
      
      assignedNumber = numberRes.data.number || numberRes.data.phone;
      orderId = numberRes.data.id || numberRes.data.orderId || "12345";

      if (!assignedNumber) {
        return bot.answerCallbackQuery(query.id, { text: "⚠️ এই মুহূর্তে এই কান্ট্রিতে কোনো নাম্বার খালি নেই!", show_alert: true });
      }

      // ডাটাবেজে সেভ করা যাতে আপনার প্যানেল বা ডাটাবেজে দেখা যায়
      await ActiveNumber.create({
        telegramId: telegramId,
        phoneNumber: assignedNumber,
        service: service,
        country: country,
        orderId: orderId,
        otpCode: "Waiting for OTP..."
      });

    } catch (error) {
      console.error("Panel API Number Error:", error.message);
      return bot.answerCallbackQuery(query.id, { text: "❌ প্যানেল থেকে নাম্বার নিতে ব্যর্থ হয়েছে!", show_alert: true });
    }

    const numberManageMenu = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Change Number", callback_data: `getnum_${service}_${country}` },
            { text: "🌐 Switch Country", callback_data: `service_${service}` }
          ],
          [
            { text: "📩 OTP Code (Auto)", callback_data: `action_otp_${orderId}` }
          ],
          [
            { text: "🔙 Main Menu", callback_data: "back_to_menu" }
          ]
        ]
      }
    };

    bot.editMessageText(`✅ **প্যানেল থেকে সফলভাবে নাম্বার নেওয়া হয়েছে!**\n\n📱 নাম্বার: \`${assignedNumber}\`\n🌐 কান্ট্রি: ${country.toUpperCase()}\n🛠️ সার্ভিস: ${service.toUpperCase()}\n\n⏳ ওটিপির জন্য অপেক্ষা করা হচ্ছে...`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      ...numberManageMenu
    });
  }

  // ওটিপি চেক হ্যান্ডেলার
  else if (data.startsWith('action_otp_')) {
    const orderId = data.split('_')[2];
    try {
      const statusRes = await axios.get(`${process.env.API_URL}?action=getStatus&id=${orderId}&key=${process.env.API_KEY}`);
      const code = statusRes.data.code || statusRes.data.otp || "কোনো কোড আসেনি";
      
      bot.answerCallbackQuery(query.id, { text: `🔑 লেটেস্ট ওটিপি: ${code}`, show_alert: true });
    } catch (err) {
      bot.answerCallbackQuery(query.id, { text: "⚠️ ওটিপি চেক করতে সমস্যা হয়েছে।", show_alert: true });
    }
    return;
  }

  // ব্যাক টু মেনু
  else if (data === 'back_to_menu') {
    sendMainMenu(chatId, messageId);
  }

  bot.answerCallbackQuery(query.id);
});

console.log("Dynamic Panel Bot is running smoothly...");
