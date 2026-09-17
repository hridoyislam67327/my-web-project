require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const User = require('./models/User');
const Settings = require('./models/Settings');

const BOT_TOKEN = process.env.BOT_TOKEN;
const PANEL_API_URL = process.env.PANEL_API_URL;
const PANEL_API_KEY = process.env.PANEL_API_KEY;

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is missing in .env');
}

if (!PANEL_API_URL) {
  throw new Error('PANEL_API_URL is missing in .env');
}

if (!PANEL_API_KEY) {
  throw new Error('PANEL_API_KEY is missing in .env');
}

const bot = new Telegraf(BOT_TOKEN);

// ===============================
// Panel API Client
// ===============================

const panelAPI = axios.create({
  baseURL: PANEL_API_URL.replace(/\/+$/, ''),
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${PANEL_API_KEY}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
});

// ===============================
// Helper Functions
// ===============================

async function getSettings() {
  return await Settings.findOne();
}

function mainMenu() {
  return Markup.keyboard([
    ['🌍 কান্ট্রি ও নাম্বার নিন', '💰 আমার ব্যালেন্স'],
    ['📊 কাজের স্ট্যাটাস']
  ]).resize();
}

function countryMenu(countries) {
  const buttons = [];

  for (const country of countries) {
    if (!country?.name || !country?.code) continue;

    buttons.push([
      Markup.button.callback(
        `🏳️ ${country.name} (${country.code})`,
        `get_num_${String(country.code).toLowerCase()}`
      )
    ]);
  }

  buttons.push([
    Markup.button.callback('🔙 Back', 'back_to_menu')
  ]);

  return Markup.inlineKeyboard(buttons);
}

// ===============================
// /start
// ===============================

bot.start(async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);
    const username = ctx.from.username || 'User';

    let user = await User.findOne({ telegramId });

    if (!user) {
      user = new User({
        telegramId,
        username,
        balance: 0,
        status: 'Active'
      });

      await user.save();
    } else {
      // Username update
      if (user.username !== username) {
        user.username = username;
        await user.save();
      }
    }

    if (user.status && user.status !== 'Active') {
      return ctx.reply(
        '❌ আপনার অ্যাকাউন্ট বর্তমানে সক্রিয় নয়।'
      );
    }

    const settings = await getSettings();

    const channelLink =
      settings?.channelLink || 'https://t.me/your_channel';

    const topText =
      settings?.topMessageText ||
      'স্বাগতম আমাদের বটে!';

    await ctx.reply(
      `${topText}\n\n⚠️ বট ব্যবহার করতে প্রথমে আমাদের চ্যানেলে জয়েন করুন।`,
      Markup.inlineKeyboard([
        [
          Markup.button.url(
            '📢 জয়েন চ্যানেল',
            channelLink
          )
        ],
        [
          Markup.button.callback(
            '✅ ভেরিফাই করুন',
            'verify_join'
          )
        ]
      ])
    );

  } catch (error) {
    console.error('START ERROR:', error);

    await ctx.reply(
      '❌ বর্তমানে সার্ভারে সমস্যা হচ্ছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
    );
  }
});

// ===============================
// Channel Verification
// ===============================

bot.action('verify_join', async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const settings = await getSettings();

    if (!settings?.channelUsername) {
      return ctx.reply(
        '❌ Channel verification configuration পাওয়া যায়নি।'
      );
    }

    const telegramId = ctx.from.id;

    const member = await ctx.telegram.getChatMember(
      settings.channelUsername,
      telegramId
    );

    const allowedStatuses = [
      'creator',
      'administrator',
      'member'
    ];

    if (!allowedStatuses.includes(member.status)) {
      return ctx.answerCbQuery(
        '❌ আগে চ্যানেলে জয়েন করুন।',
        { show_alert: true }
      );
    }

    await ctx.editMessageText(
      '✅ আপনার চ্যানেল ভেরিফিকেশন সফল হয়েছে!'
    );

    await ctx.reply(
      'মেইন মেনু থেকে একটি অপশন নির্বাচন করুন:',
      mainMenu()
    );

  } catch (error) {
    console.error('VERIFY ERROR:', error);

    try {
      await ctx.answerCbQuery(
        '❌ Verification করা যাচ্ছে না।',
        { show_alert: true }
      );
    } catch (_) {}

  }
});

// ===============================
// Country List
// ===============================

bot.hears('🌍 কান্ট্রি ও নাম্বার নিন', async (ctx) => {
  try {
    const response = await panelAPI.get('/countries');

    let countries = response.data;

    // যদি API { countries: [] } দেয়
    if (response.data?.countries) {
      countries = response.data.countries;
    }

    if (!Array.isArray(countries) || countries.length === 0) {
      return ctx.reply(
        '❌ বর্তমানে কোনো কান্ট্রি available নেই।'
      );
    }

    await ctx.reply(
      '🌍 একটি কান্ট্রি নির্বাচন করুন:',
      countryMenu(countries)
    );

  } catch (error) {
    console.error(
      'COUNTRY API ERROR:',
      error.response?.data || error.message
    );

    await ctx.reply(
      '❌ কান্ট্রি লিস্ট লোড করতে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।'
    );
  }
});

// ===============================
// Get Number
// ===============================

bot.action(/^get_num_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const countryCode = ctx.match[1];

    if (!countryCode) {
      return ctx.reply('❌ Invalid country.');
    }

    const response = await panelAPI.post('/get-number', {
      country: countryCode
    });

    const data = response.data?.number
      ? response.data
      : response.data?.data;

    if (!data?.number) {
      return ctx.reply(
        '❌ এই কান্ট্রিতে বর্তমানে কোনো নাম্বার available নেই।'
      );
    }

    const numberId = data.id || data.numberId;

    if (!numberId) {
      return ctx.reply(
        '❌ Panel থেকে valid number ID পাওয়া যায়নি।'
      );
    }

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          '🔄 সুইচ নাম্বার',
          `get_num_${countryCode}`
        ),
        Markup.button.callback(
          '🌍 সুইচ কান্ট্রি',
          'back_to_countries'
        )
      ],
      [
        Markup.button.callback(
          '📊 OTP Status',
          `check_otp_${numberId}`
        )
      ],
      [
        Markup.button.callback(
          '🔙 Main Menu',
          'back_to_menu'
        )
      ]
    ]);

    await ctx.reply(
      `📞 আপনার নাম্বার: \`${data.number}\`\n` +
      `🌍 Country: ${countryCode.toUpperCase()}\n\n` +
      `⏳ Number successfully assigned.`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );

  } catch (error) {
    console.error(
      'GET NUMBER ERROR:',
      error.response?.data || error.message
    );

    await ctx.reply(
      '❌ নাম্বার নিতে সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
    );
  }
});

// ===============================
// Switch Country
// ===============================

bot.action('back_to_countries', async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const response = await panelAPI.get('/countries');

    let countries = response.data;

    if (response.data?.countries) {
      countries = response.data.countries;
    }

    if (!Array.isArray(countries) || countries.length === 0) {
      return ctx.reply(
        '❌ বর্তমানে কোনো কান্ট্রি available নেই।'
      );
    }

    await ctx.editMessageText(
      '🌍 অন্য একটি কান্ট্রি নির্বাচন করুন:',
      countryMenu(countries)
    );

  } catch (error) {
    console.error(
      'SWITCH COUNTRY ERROR:',
      error.response?.data || error.message
    );

    await ctx.reply(
      '❌ কান্ট্রি লিস্ট লোড করা যাচ্ছে না।'
    );
  }
});

// ===============================
// OTP Status
// ===============================

bot.action(/^check_otp_(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();

    const numberId = ctx.match[1];

    /*
      এখানে তোমার Panel-এর official OTP-status endpoint বসাতে হবে।

      উদাহরণ:
      const response = await panelAPI.get(
        `/get-otp/${numberId}`
      );

      তারপর panel-এর response অনুযায়ী status দেখাতে হবে।
    */

    await ctx.reply(
      `📊 OTP Status\n\n` +
      `Number ID: ${numberId}\n\n` +
      `⏳ OTP status বর্তমানে panel API-এর response-এর ওপর নির্ভর করবে।`
    );

  } catch (error) {
    console.error(
      'OTP STATUS ERROR:',
      error.response?.data || error.message
    );

    await ctx.reply(
      '❌ OTP status check করতে সমস্যা হয়েছে।'
    );
  }
});

// ===============================
// Back To Main Menu
// ===============================

bot.action('back_to_menu', async (ctx) => {
  try {
    await ctx.answerCbQuery();

    await ctx.editMessageText(
      '🏠 Main Menu'
    );

    await ctx.reply(
      'একটি অপশন নির্বাচন করুন:',
      mainMenu()
    );

  } catch (error) {
    console.error('BACK MENU ERROR:', error.message);
  }
});

// ===============================
// Balance
// ===============================

bot.hears('💰 আমার ব্যালেন্স', async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);

    const user = await User.findOne({ telegramId });
    const settings = await getSettings();

    const balance = Number(user?.balance || 0);
    const rate = Number(settings?.otpRate || 0);

    await ctx.reply(
      `💳 আপনার ব্যালেন্স: ৳${balance.toFixed(2)}\n` +
      `💵 পার-ওটিপি রেট: ৳${rate.toFixed(2)}`
    );

  } catch (error) {
    console.error('BALANCE ERROR:', error);

    await ctx.reply(
      '❌ ব্যালেন্স দেখতে সমস্যা হয়েছে।'
    );
  }
});

// ===============================
// Work Status
// ===============================

bot.hears('📊 কাজের স্ট্যাটাস', async (ctx) => {
  try {
    const telegramId = String(ctx.from.id);

    const user = await User.findOne({ telegramId });

    if (!user) {
      return ctx.reply(
        '❌ আপনার user account পাওয়া যায়নি। /start দিন।'
      );
    }

    await ctx.reply(
      `📊 কাজের স্ট্যাটাস\n\n` +
      `👤 Status: ${user.status || 'Active'}\n` +
      `💰 Balance: ৳${Number(user.balance || 0).toFixed(2)}`
    );

  } catch (error) {
    console.error('STATUS ERROR:', error);

    await ctx.reply(
      '❌ Status দেখতে সমস্যা হয়েছে।'
    );
  }
});

// ===============================
// Global Error Handler
// ===============================

bot.catch((error, ctx) => {
  console.error(
    'BOT ERROR:',
    error
  );
});

// ===============================
// Launch
// ===============================

bot.launch()
  .then(() => {
    console.log(
      '✅ Telegram Bot is running successfully.'
    );
  })
  .catch((error) => {
    console.error(
      '❌ Bot launch error:',
      error
    );
  });

// ===============================
// Graceful Shutdown
// ===============================

process.once('SIGINT', () => {
  bot.stop('SIGINT');
});

process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
});
