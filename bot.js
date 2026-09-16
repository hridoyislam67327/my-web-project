require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');

// Database Models
const User = require('./models/User');
const ActiveNumber = require('./models/Number');

// Initialize Bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Connect MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

// Axios API Instance Configuration
const api = axios.create({
  baseURL: process.env.OTP_API_URL,
  headers: {
    'X-API-Key': process.env.OTP_API_KEY,
    'Content-Type': 'application/json'
  }
});

// Command: /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const telegramId = msg.from.id.toString();

  // Create or Find User in DB
  let user = await User.findOne({ telegramId });
  if (!user) {
    user = await User.create({ telegramId, username: msg.from.username });
  }

  if (user.status === 'SUSPENDED') {
    return bot.sendMessage(chatId, "❌ আপনার অ্যাকাউন্টটি সাসপেন্ড করা হয়েছে। এডমিনের সাথে যোগাযোগ করুন।");
  }

  const options = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "📘 Facebook", callback_data: "cat_facebook" },
          { text: "📷 Instagram", callback_data: "cat_instagram" }
        ],
        [
          { text: "💬 WhatsApp", callback_data: "cat_whatsapp" },
          { text: "✈️ Telegram", callback_data: "cat_telegram" }
        ],
        [
          { text: "📱 imo", callback_data: "cat_imo" }
        ],
        [
          { text: "👤 Profile / Balance", callback_data: "user_profile" }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, `👋 **স্বাগতম!**\n\n💰 আপনার বর্তমান ব্যালেন্স: \`${user.balance || 0}\` BDT\n\nপ্রয়োজনীয় সার্ভিস নির্বাচন করুন:`, {
    parse_mode: 'Markdown',
    ...options
  });
});

// Callback Query Handler
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const telegramId = query.from.id.toString();
  const data = query.data;

  // 1. User Profile
  if (data === 'user_profile') {
    const user = await User.findOne({ telegramId });
    return bot.sendMessage(chatId, `👤 **ইউজার প্রোফাইল**\n\n🆔 ID: \`${telegramId}\`\n💰 Balance: \`${user ? user.balance : 0}\` BDT`, { parse_mode: 'Markdown' });
  }

  // 2. Select Category (Returns Range / Country Options)
  if (data.startsWith('cat_')) {
    const service = data.split('_')[1];
    
    // Example range prefix mapping according to your API format
    const rangeOptions = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🇬🇧 UK Range 1 (26134XXX)", callback_data: `getnum_${service}_26134XXX` },
            { text: "🇬🇧 UK Range 2 (22507XXX)", callback_data: `getnum_${service}_22507XXX` }
          ],
          [
            { text: "🔙 Back to Menu", callback_data: "go_back" }
          ]
        ]
      }
    };
    return bot.sendMessage(chatId, `📌 **${service.toUpperCase()}**-এর জন্য রেন্জ নির্বাচন করুন:`, { parse_mode: 'Markdown', ...rangeOptions });
  }

  // 3. Request Number From API (/getnum)
  if (data.startsWith('getnum_')) {
    const [, service, range] = data.split('_');

    bot.sendMessage(chatId, "🔄 নতুন নাম্বার সংগ্রহ করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...");

    try {
      // Call POST API (/getnum)
      const res = await api.post('/getnum', { range });

      if (res.data && res.data.meta && res.data.meta.code === 200) {
        const numData = res.data.data;
        const fullNumber = numData.full_number;

        // Save active number in MongoDB
        await ActiveNumber.create({
          telegramId,
          phoneNumber: fullNumber,
          service,
          country: numData.country || 'Unknown',
          orderId: `ORD_${Date.now()}`
        });

        const numberMenu = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "🔄 Change Number", callback_data: `act_change_${fullNumber}_${range}` },
                { text: "🗑️ Delete", callback_data: `act_delete_${fullNumber}` }
              ],
              [
                { text: "👁️ View Code", callback_data: `act_view_${fullNumber}` },
                { text: "📩 OTP Code", callback_data: `act_otp_${fullNumber}` }
              ]
            ]
          }
        };

        bot.sendMessage(chatId, `✅ **নাম্বার বরাদ্দ করা হয়েছে!**\n\n📱 **নাম্বার:** \`${fullNumber}\`\n🌐 **কান্ট্রি:** ${numData.country}\n📡 **অপারেটর:** ${numData.operator}\n🛠️ **সার্ভিস:** ${service.toUpperCase()}`, {
          parse_mode: 'Markdown',
          ...numberMenu
        });
      } else {
        bot.sendMessage(chatId, "❌ স্টক খালি রয়েছে অথবা নাম্বার পাওয়া যায়নি। পরে চেষ্টা করুন।");
      }
    } catch (err) {
      console.error("API Error:", err.response ? err.response.data : err.message);
      bot.sendMessage(chatId, "⚠️ এপিআই থেকে নাম্বার আনতে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    }
  }

  // 4. Actions: Get OTP, View Code, Cancel/Delete, Change Number
  if (data.startsWith('act_')) {
    const parts = data.split('_');
    const action = parts[1];
    const number = parts[2];

    // Fetch Live Console Feed for OTP
    if (action === 'otp' || action === 'view') {
      bot.sendMessage(chatId, "🔎 ওটিপি কোড চেক করা হচ্ছে...");

      try {
        // Call GET API (/live-console)
        const res = await api.get('/live-console?limit=55');

        if (res.data && res.data.data && res.data.data.otps) {
          const matchedOtp = res.data.data.otps.find(o => o.number === number);

          if (matchedOtp && matchedOtp.otp) {
            // Update Mongo DB
            await ActiveNumber.findOneAndUpdate(
              { phoneNumber: number },
              { otpCode: matchedOtp.otp, fullMessage: matchedOtp.message, status: 'RECEIVED' }
            );

            bot.sendMessage(chatId, `📩 **ওটিপি মেসেজ পাওয়া গেছে!**\n\n📱 **নাম্বার:** \`${number}\`\n🔑 **OTP Code:** \`${matchedOtp.otp}\`\n💬 **মেসেজ:** \`${matchedOtp.message}\``, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `⏳ **\`${number}\`** নাম্বারে এখনো কোনো ওটিপি আসেনি। কিছুক্ষণ পর **OTP Code** বাটনে আবার চাপুন।`, { parse_mode: 'Markdown' });
          }
        } else {
          bot.sendMessage(chatId, "⏳ কোনো নতুন ওটিপি পাওয়া যায়নি।");
        }
      } catch (err) {
        console.error("OTP API Error:", err.message);
        bot.sendMessage(chatId, "⚠️ ওটিপি চেক করতে সমস্যা হয়েছে।");
      }
    }

    // Delete / Cancel Number
    if (action === 'delete') {
      await ActiveNumber.findOneAndUpdate({ phoneNumber: number }, { status: 'CANCELLED' });
      bot.sendMessage(chatId, `🗑️ \`${number}\` নাম্বারটি ক্যান্সেল করে দেওয়া হয়েছে।`, { parse_mode: 'Markdown' });
    }

    // Change Number (Requests new one with same range)
    if (action === 'change') {
      const range = parts[3] || "26134XXX";
      bot.sendMessage(chatId, `🔄 পুরোনো নাম্বার বাদ দিয়ে নতুন নাম্বার নেওয়া হচ্ছে...`);
      // Trigger new number request
      bot.emit('callback_query', {
        ...query,
        data: `getnum_service_${range}`
      });
    }
  }

  // Go Back
  if (data === 'go_back') {
    bot.emit('message', { chat: { id: chatId }, from: { id: telegramId }, text: '/start' });
  }
});
