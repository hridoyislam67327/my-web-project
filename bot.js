require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const User = require('./models/User');
const Service = require('./models/Service');
const ActiveNumber = require('./models/Number');
const Settings = require('./models/Settings');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected for Bot'))
  .catch(err => console.error(err));

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// সেটিংস লোডার
async function getSettings() {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }
  return settings;
}

// মূল বটম মেনু
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      [{ text: "🈴 NUMBERS" }],
      [{ text: "🔐 2FA AUTH" }, { text: "📦 HISTORY" }],
      [{ text: "💰 BALANCE" }, { text: "💸 WITHDRAW" }],
      [{ text: "📊 LIVE TRAFFIC" }]
    ],
    resize_keyboard: true
  }
};

// 👑 টেলিগ্রাম থেকেই ডাইরেক্ট এডমিন কন্ট্রোল কমান্ড (/admin)
bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id.toString();
  if (chatId !== process.env.ADMIN_TELEGRAM_ID) {
    return bot.sendMessage(chatId, "❌ **Access Denied! Only Admin can access this panel.**");
  }

  const adminButtons = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📢 Broadcast Message", callback_data: "adm_broadcast" }],
        [{ text: "👤 User Balance Edit", callback_data: "adm_edit_balance" }],
        [{ text: "🚫 Ban / Unban User", callback_data: "adm_ban_user" }],
        [{ text: "🔗 Edit OTP Group Link", callback_data: "adm_edit_link" }]
      ]
    }
  };

  bot.sendMessage(chatId, "👑 **Admin Quick Control Panel Panel**\nChoose an action:", { parse_mode: 'Markdown', ...adminButtons });
});

// Start Command & User Checking
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();
  let user = await User.findOne({ telegramId: chatId });

  if (user && user.isBanned) {
    return bot.sendMessage(chatId, "🚫 **Your account has been suspended by the Admin.**");
  }

  if (!user) {
    user = await User.create({ telegramId: chatId, username: msg.from.username, balance: 0 });
  }

  bot.sendMessage(chatId, `👋 **Welcome, ${msg.from.first_name}!**`, { parse_mode: 'Markdown', ...mainKeyboard });
});

// বটম মেনু লিসেনার
bot.on('message', async (msg) => {
  const chatId = msg.chat.id.toString();
  const text = msg.text;

  const user = await User.findOne({ telegramId: chatId });
  if (user && user.isBanned) return;

  if (text === "🈴 NUMBERS") {
    const options = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📘 Facebook", callback_data: "cat_facebook" }, { text: "💬 WhatsApp", callback_data: "cat_whatsapp" }],
          [{ text: "✈️ Telegram", callback_data: "cat_telegram" }, { text: "📷 Instagram", callback_data: "cat_instagram" }]
        ]
      }
    };
    bot.sendMessage(chatId, "📌 **Select Service Category:**", options);

  } else if (text === "💰 BALANCE") {
    bot.sendMessage(chatId, `💳 **Your Current Balance:** $${user ? user.balance.toFixed(2) : '0.00'}`);

  } else if (text === "📊 LIVE TRAFFIC") {
    const activeRequests = await ActiveNumber.countDocuments({ status: 'WAITING' });
    const totalServed = await ActiveNumber.countDocuments();
    bot.sendMessage(chatId, `📊 **LIVE TRAFFIC ANALYTICS**\n\n🟢 Active OTP Requests: **${activeRequests}**\n📈 Total Processed Numbers: **${totalServed}**`);
  }
});

// ইনলাইন কলব্যাক অ্যাকশন ও ডায়নামিক ডিজাইন হ্যান্ডলিং
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;
  const user = await User.findOne({ telegramId: chatId });
  const settings = await getSettings();

  if (user && user.isBanned) {
    return bot.answerCallbackQuery(query.id, { text: "🚫 Account Banned!", show_alert: true });
  }

  // ১. ক্যাটাগরি ও নাম্বার কেনা
  if (data.startsWith('buy_')) {
    const [, serviceKey, countryCode, priceStr] = data.split('_');
    const price = parseFloat(priceStr);

    if (user.balance < price) {
      return bot.answerCallbackQuery(query.id, { text: "❌ Insufficient Balance!", show_alert: true });
    }

    user.balance -= price;
    await user.save();

    const generatedNum = "959686420106"; // এপিআই বা জেনারেটেড নম্বর
    const activeNum = await ActiveNumber.create({
      telegramId: chatId,
      phoneNumber: generatedNum,
      service: serviceKey,
      country: countryCode,
      orderId: "ORD_" + Date.now()
    });

    // এডমিন প্যানেল থেকে সেট করা ডাইনামিক টেমপ্লেট অ্যাপ্লাই করা
    let cardText = settings.numberCardTemplate
      .replace('{flag}', '🇲🇲')
      .replace('{country}', countryCode.toUpperCase())
      .replace('{number}', `+${activeNum.phoneNumber}`);

    const inlineButtons = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Switch Number", callback_data: `switch_num_${activeNum._id}` },
            { text: "🔄 Switch Country", callback_data: "cat_facebook" }
          ],
          [
            { text: "🔄 Code Fetch", callback_data: `code_fetch_${activeNum._id}` }
          ],
          [
            { text: "🔐 OTP GROUP", url: settings.otpGroupLink }
          ]
        ]
      }
    };

    bot.sendMessage(chatId, cardText, { parse_mode: 'Markdown', ...inlineButtons });
  }

  // ২. Code Fetch ক্লিক করা হলে
  if (data.startsWith('code_fetch_')) {
    const numId = data.split('_')[2];
    const activeNum = await ActiveNumber.findById(numId);

    if (!activeNum) return bot.answerCallbackQuery(query.id, { text: "⚠️ Number not found!", show_alert: true });

    if (activeNum.otpCode) {
      let successText = settings.codeFoundTemplate.replace('{number}', activeNum.phoneNumber);
      const copyButton = {
        reply_markup: {
          inline_keyboard: [
            [{ text: `📋 ${activeNum.otpCode}`, callback_data: "copy_code" }],
            [{ text: "📩 Get Full Message", callback_data: `full_msg_${activeNum._id}` }]
          ]
        }
      };
      bot.sendMessage(chatId, successText, { parse_mode: 'Markdown', ...copyButton });
    } else {
      let notFoundText = settings.codeNotFoundTemplate.replace('{number}', activeNum.phoneNumber);
      bot.sendMessage(chatId, notFoundText, { parse_mode: 'Markdown' });
    }
  }

  bot.answerCallbackQuery(query.id);
});
