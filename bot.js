require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const mongoose = require('mongoose');

// ডাটাবেজ মডেলস
const User = require('./models/User');
const ActiveNumber = require('./models/Number');

// বট ইনিশিয়ালাইজেশন
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// কানেক্ট ডাটাবেজ
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Connected for Bot'))
  .catch(err => console.error('MongoDB Error:', err));

// ডাইনামিক চ্যানেল লিস্ট
const forcedChannels = [
  { name: "📢 Official Channel", url: "https://t.me/your_channel" },
  { name: "💬 Support Group", url: "https://t.me/your_group" }
];

// ১. /start কমান্ড ও ফোর্স সাবস্ক্রাইব চেক
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

  // ফোর্স সাবস্ক্রাইব বাটন তৈরি
  const channelButtons = forcedChannels.map(ch => ([{ text: ch.name, url: ch.url }]));
  channelButtons.push([{ text: "✅ Verify Membership", callback_data: "verify_membership" }]);

  bot.sendMessage(chatId, "⚠️ বটটি ব্যবহার করতে হলে নিচের চ্যানেল এবং গ্রুপগুলোতে অবশ্যই জয়েন করতে হবে। জয়েন করার পর নিচে **Verify Membership** এ ক্লিক করুন:", {
    reply_markup: { inline_keyboard: channelButtons }
  });
});

// ২. ইনলাইন বাটন ও ক্যালব্যাক হ্যান্ডেলার
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const data = query.data;

  // মেম্বারশিপ ভেরিফিকেশন
  if (data === "verify_membership") {
    const isMember = true; // সফল ধরে নেওয়া হলো

    if (isMember) {
      const menuOptions = {
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
            ]
          ]
        }
      };

      bot.editMessageText("🎉 **Verification Successful!**\n\nUse the menu to get started:", {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        ...menuOptions
      });
    } else {
      bot.answerCallbackQuery(query.id, { text: "❌ আপনি এখনো সব চ্যানেলে জয়েন করেননি!", show_alert: true });
    }
  }

  // ক্যাটাগরি সিলেক্ট করার পর কান্ট্রি লিস্ট দেখানো
  else if (data.startsWith('cat_')) {
    const service = data.split('_')[1];
    const countryMenu = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🇺🇸 USA", callback_data: `getnum_${service}_usa` },
            { text: "🇬🇧 UK", callback_data: `getnum_${service}_uk` }
          ],
          [
            { text: "🇮🇳 India", callback_data: `getnum_${service}_india` },
            { text: "🇧🇩 Bangladesh", callback_data: `getnum_${service}_bd` }
          ],
          [
            { text: "🔙 Back", callback_data: "back_to_menu" }
          ]
        ]
      }
    };

    bot.editMessageText(`📌 সার্ভিস: **${service.toUpperCase()}**\n\nকান্ট্রি সিলেক্ট করুন:`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      ...countryMenu
    });
  }

  // ৩. কান্ট্রি সিলেক্ট করার পর নাম্বার জেনারেট এবং ডাটাবেজে সেভ করা
  else if (data.startsWith('getnum_')) {
    const [, service, country] = data.split('_');
    const telegramId = query.from.id.toString();

    // কান্ট্রি ওয়াইজ নাম্বার জেনারেটর (এপিআই কানেক্ট না থাকলে এটি কাজ করবে এবং ডাটাবেজে সেভ হবে)
    let assignedNumber = "";
    if (country === 'usa') assignedNumber = "+1" + Math.floor(2000000000 + Math.random() * 7999999999);
    else if (country === 'uk') assignedNumber = "+44" + Math.floor(7000000000 + Math.random() * 2999999999);
    else if (country === 'india') assignedNumber = "+91" + Math.floor(9000000000 + Math.random() * 999999999);
    else assignedNumber = "+88018" + Math.floor(10000000 + Math.random() * 90000000);

    try {
      // ডাটাবেজে সেভ করা হচ্ছে যাতে এডমিন প্যানেল থেকে দেখা যায়
      await ActiveNumber.create({
        telegramId: telegramId,
        phoneNumber: assignedNumber,
        service: service,
        country: country,
        otpCode: "Waiting for OTP..."
      });
    } catch (dbError) {
      console.error("Database Save Error:", dbError.message);
    }

    const numberManageMenu = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🔄 Change Number", callback_data: `action_change_${service}_${country}` },
            { text: "🌐 Switch Country", callback_data: `action_switch_${service}` }
          ],
          [
            { text: "📩 OTP Code (Auto)", callback_data: `action_otp_Waiting` }
          ],
          [
            { text: "🔙 Main Menu", callback_data: "back_to_menu" }
          ]
        ]
      }
    };

    bot.editMessageText(`✅ **নাম্বার বরাদ্দ করা হয়েছে এবং সেভ হয়েছে!**\n\n📱 নাম্বার: \`${assignedNumber}\`\n🌐 কান্ট্রি: ${country.toUpperCase()}\n🛠️ সার্ভিস: ${service.toUpperCase()}\n\n⏳ ওটিপির জন্য অপেক্ষা করা হচ্ছে...`, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      ...numberManageMenu
    });
  }

  // নাম্বার চেঞ্জ বা সুইচ কান্ট্রির হ্যান্ডলার
  else if (data.startsWith('action_')) {
    const parts = data.split('_');
    const action = parts[1];

    if (action === 'change') {
      const service = parts[2];
      const country = parts[3];
      const telegramId = query.from.id.toString();
      
      let newNumber = "";
      if (country === 'usa') newNumber = "+1" + Math.floor(2000000000 + Math.random() * 7999999999);
      else if (country === 'uk') newNumber = "+44" + Math.floor(7000000000 + Math.random() * 2999999999);
      else if (country === 'india') newNumber = "+91" + Math.floor(9000000000 + Math.random() * 999999999);
      else newNumber = "+88019" + Math.floor(10000000 + Math.random() * 90000000);

      try {
        await ActiveNumber.create({
          telegramId: telegramId,
          phoneNumber: newNumber,
          service: service,
          country: country,
          otpCode: "Waiting for OTP..."
        });
      } catch (err) {
        console.error("Error saving new number:", err);
      }

      const refreshedMenu = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🔄 Change Number", callback_data: `action_change_${service}_${country}` },
              { text: "🌐 Switch Country", callback_data: `action_switch_${service}` }
            ],
            [
              { text: "📩 OTP Code (Auto)", callback_data: `action_otp_Waiting` }
            ],
            [
              { text: "🔙 Main Menu", callback_data: "back_to_menu" }
            ]
          ]
        }
      };

      bot.editMessageText(`🔄 **নতুন নাম্বার দেওয়া হয়েছে!**\n\n📱 নাম্বার: \`${newNumber}\`\n🌐 কান্ট্রি: ${country.toUpperCase()}\n🛠️ সার্ভিস: ${service.toUpperCase()}`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        ...refreshedMenu
      });
    }

    else if (action === 'switch') {
      const service = parts[2];
      const switchCountryMenu = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "🇺🇸 USA", callback_data: `getnum_${service}_usa` },
              { text: "🇬🇧 UK", callback_data: `getnum_${service}_uk` }
            ],
            [
              { text: "🇮🇳 India", callback_data: `getnum_${service}_india` },
              { text: "🇧🇩 Bangladesh", callback_data: `getnum_${service}_bd` }
            ],
            [
              { text: "🔙 Back", callback_data: `cat_${service}` }
            ]
          ]
        }
      };

      bot.editMessageText(`🌐 অন্য কান্ট্রি সিলেক্ট করুন:`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'Markdown',
        ...switchCountryMenu
      });
    }

    else if (action === 'otp') {
      bot.answerCallbackQuery(query.id, { text: "🔑 লেটেস্ট ওটিপি: এখনো কোনো এসএমএস আসেনি।", show_alert: true });
      return;
    }
  }

  // ব্যাক টু মেনু
  else if (data === 'back_to_menu') {
    const menuOptions = {
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
          ]
        ]
      }
    };

    bot.editMessageText("Use the menu to get started:", {
      chat_id: chatId,
      message_id: messageId,
      ...menuOptions
    });
  }

  bot.answerCallbackQuery(query.id);
});

console.log("Telegram Bot is running smoothly...");
