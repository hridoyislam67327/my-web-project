require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const User = require('./models/User');
const Settings = require('./models/Settings');

// ==================================================
// Environment
// ==================================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const PANEL_API_URL = process.env.PANEL_API_URL;
const PANEL_API_KEY = process.env.PANEL_API_KEY;

if (!BOT_TOKEN) {
  throw new Error('❌ BOT_TOKEN is missing in .env');
}

if (!PANEL_API_URL) {
  throw new Error('❌ PANEL_API_URL is missing in .env');
}

if (!PANEL_API_KEY) {
  throw new Error('❌ PANEL_API_KEY is missing in .env');
}

// ==================================================
// Telegram Bot
// ==================================================

const bot = new Telegraf(BOT_TOKEN);

// ==================================================
// Panel API
// ==================================================

const panelAPI = axios.create({
  baseURL: PANEL_API_URL.replace(/\/+$/, ''),
  timeout: 15000,
  headers: {
    Authorization: `Bearer ${PANEL_API_KEY}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
});

// ==================================================
// Helper: Settings
// ==================================================

async function getSettings() {
  return await Settings.findOne();
}

// ==================================================
// Helper: User
// ==================================================

async function getOrCreateUser(ctx) {
  const telegramId = String(ctx.from.id);
  const username = ctx.from.username || 'User';

  let user = await User.findOne({ telegramId });

  if (!user) {
    user = new User({
      telegramId,
      username,
      balance: 0,
      status: 'Active',
      lastActive: new Date()
    });

    await user.save();
  } else {
    user.username = username;
    user.lastActive = new Date();

    await user.save();
  }

  return user;
}

// ==================================================
// Helper: Main Menu
// ==================================================

function mainMenu() {
  return Markup.keyboard([
    ['🌍 কান্ট্রি ও নাম্বার নিন', '💰 আমার ব্যালেন্স'],
    ['📊 কাজের স্ট্যাটাস']
  ]).resize();
}

// ==================================================
// Helper: Country Menu
// ==================================================

function makeCountryMenu(countries) {
  const buttons = [];

  for (const country of countries) {
    if (!country?.name || !country?.code) {
      continue;
    }

    const code = String(country.code).trim().toLowerCase();

    buttons.push([
      Markup.button.callback(
        `🏳️ ${country.name} (${country.code})`,
        `get_num_${code}`
      )
    ]);
  }

  buttons.push([
    Markup.button.callback(
      '🔙 Main Menu',
      'back_to_menu'
    )
  ]);

  return Markup.inlineKeyboard(buttons);
}

// ==================================================
// /start
// ==================================================

bot.start(async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx);

    if (user.status === 'Banned') {
      return ctx.reply(
        '❌ আপনার অ্যাকাউন্টটি বর্তমানে নিষিদ্ধ করা হয়েছে।'
      );
    }

    const settings = await getSettings();

    const channelLink =
      settings?.channelLink ||
      'https://t.me/Mathod_Channel';

    const topText =
      settings?.topMessageText ||
      'স্বাগতম আমাদের বটে!';

    await ctx.reply(
      `${topText}\n\n` +
      `⚠️ বট ব্যবহার করতে প্রথমে আমাদের চ্যানেলে জয়েন করুন।`,
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
      '❌ সার্ভারে সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
    );
  }
});

// ==================================================
// Channel Verification
// ==================================================

bot.action('verify_join', async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx);

    if (user.status === 'Banned') {
      return ctx.answerCbQuery(
        '❌ আপনার অ্যাকাউন্ট নিষিদ্ধ।',
        { show_alert: true }
      );
    }

    const settings = await getSettings();

    if (!settings?.channelUsername) {
      return ctx.answerCbQuery(
        '❌ Channel verification সেট করা হয়নি।',
        { show_alert: true }
      );
    }

    const channelUsername =
      String(settings.channelUsername).trim();

    const member = await ctx.telegram.getChatMember(
      channelUsername,
      ctx.from.id
    );

    const allowedStatuses = [
      'creator',
      'administrator',
      'member'
    ];

    if (!allowedStatuses.includes(member.status)) {
      return ctx.answerCbQuery(
        '❌ আগে আমাদের চ্যানেলে জয়েন করুন।',
        { show_alert: true }
      );
    }

    await ctx.answerCbQuery(
      '✅ Verification successful!'
    );

    try {
      await ctx.editMessageText(
        '✅ আপনার ভেরিফিকেশন সফল হয়েছে!'
      );
    } catch (editError) {
      console.log(
        'Message edit skipped:',
        editError.message
      );
    }

    await ctx.reply(
      '🏠 মেইন মেনু থেকে একটি অপশন নির্বাচন করুন:',
      mainMenu()
    );

  } catch (error) {
    console.error(
      'VERIFY ERROR:',
      error.response?.description ||
      error.message
    );

    try {
      await ctx.answerCbQuery(
        '❌ Verification করা যাচ্ছে না।',
        { show_alert: true }
      );
    } catch (_) {}
  }
});

// ==================================================
// Country List
// ==================================================

async function sendCountryList(ctx, editMessage = false) {
  try {
    const response = await panelAPI.get('/countries');

    let countries = response.data;

    // Supported response:
    // [ ... ]
    // অথবা
    // { countries: [ ... ] }

    if (Array.isArray(response.data?.countries)) {
      countries = response.data.countries;
    }

    if (!Array.isArray(countries)) {
      return ctx.reply(
        '❌ Panel থেকে সঠিক country data পাওয়া যায়নি।'
      );
    }

    if (countries.length === 0) {
      return ctx.reply(
        '❌ বর্তমানে কোনো country available নেই।'
      );
    }

    const keyboard = makeCountryMenu(countries);

    if (editMessage && ctx.callbackQuery) {
      try {
        await ctx.editMessageText(
          '🌍 একটি country নির্বাচন করুন:',
          keyboard
        );
        return;
      } catch (editError) {
        console.log(
          'Country message edit failed:',
          editError.message
        );
      }
    }

    await ctx.reply(
      '🌍 একটি country নির্বাচন করুন:',
      keyboard
    );

  } catch (error) {
    console.error(
      'COUNTRY API ERROR:',
      error.response?.data ||
      error.message
    );

    await ctx.reply(
      '❌ Country list load করতে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।'
    );
  }
}

bot.hears(
  '🌍 কান্ট্রি ও নাম্বার নিন',
  async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx);

      if (user.status === 'Banned') {
        return ctx.reply(
          '❌ আপনার অ্যাকাউন্টটি বর্তমানে নিষিদ্ধ।'
        );
      }

      await sendCountryList(ctx);

    } catch (error) {
      console.error(
        'COUNTRY HANDLER ERROR:',
        error
      );

      await ctx.reply(
        '❌ অনুরোধটি সম্পন্ন করা যায়নি।'
      );
    }
  }
);

// ==================================================
// Get Number
// ==================================================

bot.action(/^get_num_(.+)$/, async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx);

    if (user.status === 'Banned') {
      return ctx.answerCbQuery(
        '❌ আপনার অ্যাকাউন্ট নিষিদ্ধ।',
        { show_alert: true }
      );
    }

    const countryCode =
      String(ctx.match[1]).trim().toLowerCase();

    if (!countryCode) {
      return ctx.answerCbQuery(
        '❌ Invalid country.',
        { show_alert: true }
      );
    }

    await ctx.answerCbQuery(
      '⏳ Number নেওয়া হচ্ছে...'
    );

    const response = await panelAPI.post(
      '/get-number',
      {
        country: countryCode
      }
    );

    let data = response.data;

    // Supported:
    // { number, id }
    // অথবা
    // { data: { number, id } }

    if (response.data?.data) {
      data = response.data.data;
    }

    if (!data?.number) {
      return ctx.reply(
        '❌ এই country-তে বর্তমানে কোনো number available নেই।'
      );
    }

    const numberId =
      data.id ||
      data.numberId;

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
      `⏳ Number successfully assigned.\n` +
      `📊 OTP status দেখতে নিচের বাটন ব্যবহার করুন।`,
      {
        parse_mode: 'Markdown',
        ...keyboard
      }
    );

  } catch (error) {
    console.error(
      'GET NUMBER ERROR:',
      error.response?.data ||
      error.message
    );

    await ctx.reply(
      '❌ Number নিতে সমস্যা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।'
    );
  }
});

// ==================================================
// Switch Country
// ==================================================

bot.action(
  'back_to_countries',
  async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx);

      if (user.status === 'Banned') {
        return ctx.answerCbQuery(
          '❌ আপনার অ্যাকাউন্ট নিষিদ্ধ।',
          { show_alert: true }
        );
      }

      await ctx.answerCbQuery();

      await sendCountryList(ctx, true);

    } catch (error) {
      console.error(
        'SWITCH COUNTRY ERROR:',
        error
      );

      await ctx.reply(
        '❌ Country list load করতে সমস্যা হয়েছে।'
      );
    }
  }
);

// ==================================================
// OTP Status
// ==================================================

bot.action(
  /^check_otp_(.+)$/,
  async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx);

      if (user.status === 'Banned') {
        return ctx.answerCbQuery(
          '❌ আপনার অ্যাকাউন্ট নিষিদ্ধ।',
          { show_alert: true }
        );
      }

      const numberId =
        String(ctx.match[1]).trim();

      await ctx.answerCbQuery();

      /*
       * এখানে তোমার Panel-এর official
       * OTP STATUS API endpoint বসাতে হবে।
       *
       * উদাহরণ:
       *
       * const response = await panelAPI.get(
       *   `/number-status/${numberId}`
       * );
       *
       * Panel-এর documentation ছাড়া
       * endpoint অনুমান করা যাবে না।
       */

      await ctx.reply(
        `📊 Number Status\n\n` +
        `🆔 Number ID: ${numberId}\n\n` +
        `⏳ Panel API-এর official status endpoint সংযুক্ত করা হয়নি।`
      );

    } catch (error) {
      console.error(
        'OTP STATUS ERROR:',
        error.response?.data ||
        error.message
      );

      await ctx.reply(
        '❌ Number status check করতে সমস্যা হয়েছে।'
      );
    }
  }
);

// ==================================================
// Back To Main Menu
// ==================================================

bot.action(
  'back_to_menu',
  async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx);

      if (user.status === 'Banned') {
        return ctx.answerCbQuery(
          '❌ আপনার অ্যাকাউন্ট নিষিদ্ধ।',
          { show_alert: true }
        );
      }

      await ctx.answerCbQuery();

      try {
        await ctx.editMessageText(
          '🏠 Main Menu'
        );
      } catch (editError) {
        console.log(
          'Main menu edit skipped:',
          editError.message
        );
      }

      await ctx.reply(
        '🏠 একটি অপশন নির্বাচন করুন:',
        mainMenu()
      );

    } catch (error) {
      console.error(
        'BACK MENU ERROR:',
        error
      );
    }
  }
);

// ==================================================
// Balance
// ==================================================

bot.hears(
  '💰 আমার ব্যালেন্স',
  async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx);

      if (user.status === 'Banned') {
        return ctx.reply(
          '❌ আপনার অ্যাকাউন্ট নিষিদ্ধ।'
        );
      }

      const settings = await getSettings();

      const balance =
        Number(user.balance || 0);

      const rate =
        Number(settings?.otpRate || 0);

      await ctx.reply(
        `💳 আপনার ব্যালেন্স: ৳${balance.toFixed(2)}\n` +
        `💵 পার-ওটিপি রেট: ৳${rate.toFixed(2)}`
      );

    } catch (error) {
      console.error(
        'BALANCE ERROR:',
        error
      );

      await ctx.reply(
        '❌ ব্যালেন্স দেখতে সমস্যা হয়েছে।'
      );
    }
  }
);

// ==================================================
// Work Status
// ==================================================

bot.hears(
  '📊 কাজের স্ট্যাটাস',
  async (ctx) => {
    try {
      const user = await getOrCreateUser(ctx);

      if (user.status === 'Banned') {
        return ctx.reply(
          '❌ আপনার অ্যাকাউন্ট নিষিদ্ধ।'
        );
      }

      await ctx.reply(
        `📊 কাজের স্ট্যাটাস\n\n` +
        `👤 Status: ${user.status || 'Active'}\n` +
        `💰 Balance: ৳${Number(user.balance || 0).toFixed(2)}\n` +
        `🕐 Last Active: ${user.lastActive ? user.lastActive.toLocaleString() : 'N/A'}`
      );

    } catch (error) {
      console.error(
        'STATUS ERROR:',
        error
      );

      await ctx.reply(
        '❌ Status দেখতে সমস্যা হয়েছে।'
      );
    }
  }
);

// ==================================================
// Unknown Text
// ==================================================

bot.on('text', async (ctx) => {
  try {
    const user = await getOrCreateUser(ctx);

    if (user.status === 'Banned') {
      return ctx.reply(
        '❌ আপনার অ্যাকাউন্ট নিষিদ্ধ।'
      );
    }

    await ctx.reply(
      '⚠️ অনুগ্রহ করে নিচের মেনু থেকে একটি অপশন নির্বাচন করুন।',
      mainMenu()
    );

  } catch (error) {
    console.error(
      'TEXT HANDLER ERROR:',
      error
    );
  }
});

// ==================================================
// Global Bot Error Handler
// ==================================================

bot.catch((error, ctx) => {
  console.error(
    '❌ Telegram Bot Error:',
    error
  );
});

// ==================================================
// Launch
// ==================================================

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

// ==================================================
// Graceful Shutdown
// ==================================================

process.once(
  'SIGINT',
  () => {
    bot.stop('SIGINT');
  }
);

process.once(
  'SIGTERM',
  () => {
    bot.stop('SIGTERM');
  }
);
