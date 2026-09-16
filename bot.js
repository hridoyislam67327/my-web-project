require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');

const User = require('./models/User');
const Service = require('./models/Service');
const ActiveNumber = require('./models/Number');

mongoose.connect(process.env.MONGO_URI);
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();
  let user = await User.findOne({ telegramId: chatId });
  if (!user) {
    user = await User.create({ telegramId: chatId, username: msg.from.username, firstName: msg.from.first_name, balance: 0 });
  }

  if (user.isSuspended) return bot.sendMessage(chatId, "❌ অ্যাকাউন্ট স্থগিত করা হয়েছে।");

  const options = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: "📘 Facebook", callback_data: "cat_facebook" }, { text: "📷 Instagram", callback_data: "cat_instagram" }],
        [{ text: "💬 WhatsApp", callback_data: "cat_whatsapp" }, { text: "✈️ Telegram", callback_data: "cat_telegram" }],
        [{ text: "📱 imo", callback_data: "cat_imo" }]
      ]
    }
  };

  bot.sendMessage(chatId, `👋 স্বাগতম ${msg.from.first_name}!\n💳 ব্যালেন্স: $${user.balance.toFixed(2)}`, options);
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id.toString();
  const data = query.data;

  if (data.startsWith('cat_')) {
    const serviceKey = data.split('_')[1];
    const defaultButtons = [
      [{ text: "🇺🇸 USA ($0.50)", callback_data: `buy_${serviceKey}_usa_0.50` }, { text: "🇬🇧 UK ($0.60)", callback_data: `buy_${serviceKey}_uk_0.60` }]
    ];
    bot.editMessageText(`📌 **${serviceKey.toUpperCase()}**-এর জন্য কান্ট্রি সিলেক্ট করুন:`, {
      chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown', reply_markup: { inline_keyboard: defaultButtons }
    });
  }

  if (data.startsWith('buy_')) {
    const [, serviceKey, countryCode, priceStr] = data.split('_');
    const mockNumber = "+1202555" + Math.floor(1000 + Math.random() * 9000);
    
    const activeNum = await ActiveNumber.create({ telegramId: chatId, phoneNumber: mockNumber, service: serviceKey, country: countryCode, orderId: "ORD_" + Date.now() });

    const actionButtons = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 চেঞ্জ নাম্বার", callback_data: `action_change_${activeNum._id}` }, { text: "🗑️ ডিলিট", callback_data: `action_delete_${activeNum._id}` }],
          [{ text: "👁️ ভিউ মেসেজ", callback_data: `action_view_${activeNum._id}` }, { text: "📩 OTP Code", callback_data: `action_otp_${activeNum._id}` }]
        ]
      }
    };
    bot.sendMessage(chatId, `✅ **নাম্বার:** \`${mockNumber}\``, { parse_mode: 'Markdown', ...actionButtons });
  }

  if (data.startsWith('action_')) {
    const [action, numId] = data.split('_').slice(1);
    const activeNum = await ActiveNumber.findById(numId);
    
    if (action === 'otp' || action === 'view') {
      bot.sendMessage(chatId, `📩 **নাম্বার:** \`${activeNum.phoneNumber}\`\n🔑 **OTP Code:** \`482910\``, { parse_mode: 'Markdown' });
    } else if (action === 'delete') {
      bot.sendMessage(chatId, `🗑️ নাম্বার ডিলিট করা হয়েছে।`);
    }
  }
  bot.answerCallbackQuery(query.id);
});
