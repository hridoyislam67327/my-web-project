const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const User = require('./models/User');
const Settings = require('./models/Settings');

const bot = new Telegraf(process.env.BOT_TOKEN);

// .env থেকে এপিআই ইউআরএল এবং কি লোড করা
const PANEL_API_URL = process.env.PANEL_API_URL;
const PANEL_API_KEY = process.env.PANEL_API_KEY;

// Start Command
bot.start(async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const username = ctx.from.username || 'User';

  try {
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = new User({ telegramId, username, balance: 0, status: 'Active' });
      await user.save();
    }

    const settings = await Settings.findOne();
    const channelLink = settings ? settings.channelLink : 'https://t.me/your_channel';
    const topText = settings ? settings.topMessageText : 'স্বাগতম আমাদের ওটিপি বটে!';

    ctx.reply(`${topText}\n\n⚠️ বট ব্যবহার করতে প্রথমে আমাদের চ্যানেলে জয়েন করুন:`, Markup.inlineKeyboard([
      [Markup.button.url('📢 জয়েন চ্যানেল', channelLink)],
      [Markup.button.callback('✅ ভেরিফাই করুন', 'verify_join')]
    ]));
  } catch (error) {
    console.error('Bot start error:', error);
  }
});

// Verification Callback
bot.action('verify_join', async (ctx) => {
  const mainKeyboard = Markup.keyboard([
    ['🌍 কান্ট্রি ও নাম্বার নিন', '💰 আমার ব্যালেন্স'],
    ['📊 কাজের স্ট্যাটাস']
  ]).resize();

  ctx.editMessageText('✅ আপনার ভেরিফিকেশন সফল হয়েছে! নিচের মেনু থেকে কাজ শুরু করুন।');
  ctx.reply('মেইন মেনু:', mainKeyboard);
});

// প্যানেল এপিআই ব্যবহার করে কান্ট্রি বা সার্ভিস ফেচ করা
bot.hears('🌍 কান্ট্রি ও নাম্বার নিন', async (ctx) => {
  try {
    // আপনার প্যানেলের এপিআই রিকোয়েস্ট (প্যানেলের ডকুমেন্টেশন অনুযায়ী এন্ডপয়েন্ট পরিবর্তন করতে হতে পারে)
    const response = await axios.get(`${PANEL_API_URL}/countries`, {
      headers: { 'Authorization': `Bearer ${PANEL_API_KEY}` }
    });

    const countries = response.data; // ধরে নিচ্ছি প্যানেল থেকে অ্যারে রিটার্ন করবে
    if (!countries || countries.length === 0) {
      return ctx.reply('বর্তমানে প্যানেলে কোনো কান্ট্রি এভেলেবেল নেই।');
    }

    let buttons = countries.map(c => [Markup.button.callback(`🏳️ ${c.name} (${c.code})`, `get_num_${c.code}`)]);
    ctx.reply('প্যানেল থেকে প্রাপ্ত সক্রিয় কান্ট্রিগুলো:', Markup.inlineKeyboard(buttons));
  } catch (error) {
    console.error('API Error:', error.message);
    ctx.reply('নাম্বার প্যানেলের এপিআই থেকে ডাটা আনতে সমস্যা হয়েছে। অনুগ্রহ করে পরে চেষ্টা করুন।');
  }
});

// নির্দিষ্ট কান্ট্রি থেকে নাম্বার নেওয়ার হ্যান্ডেলার
bot.action(/get_num_(.+)/, async (ctx) => {
  const countryCode = ctx.match[1];
  try {
    // প্যানেল থেকে নাম্বার নেওয়ার এপিআই কল
    const response = await axios.post(`${PANEL_API_URL}/get-number`, {
      country: countryCode
    }, {
      headers: { 'Authorization': `Bearer ${PANEL_API_KEY}` }
    });

    const numberData = response.data;
    if(!numberData || !numberData.number) {
      return ctx.reply('দুঃখিত, এই মুহূর্তে এই কান্ট্রিতে কোনো নাম্বার খালি নেই।');
    }

    // ইনলাইন বাটন: সুইচ নাম্বার, সুইচ কান্ট্রি, কোড চেক ইত্যাদি
    const inlineButtons = Markup.inlineKeyboard([
      [Markup.button.callback('🔄 সুইচ নাম্বার', `get_num_${countryCode}`), Markup.button.callback('🌍 সুইচ কান্ট্রি', 'back_to_countries')],
      [Markup.button.callback('📩 ওটিপি চেক করুন', `check_otp_${numberData.id}`)]
    ]);

    ctx.reply(`📞 আপনার নাম্বার: \`${numberData.number}\`\n কান্ট্রি: ${countryCode}\n\nকোড আসার জন্য অপেক্ষা করুন বা নিচের বাটন ব্যবহার করুন:`, {
      parse_mode: 'Markdown',
      ...inlineButtons
    });

  } catch (error) {
    ctx.reply('নাম্বার জেনারেট করতে সমস্যা হয়েছে।');
  }
});

// ব্যালেন্স চেক
bot.hears('💰 আমার ব্যালেন্স', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const user = await User.findOne({ telegramId });
  const settings = await Settings.findOne();
  const rate = settings ? settings.otpRate : 1.0;
  ctx.reply(`💳 আপনার ব্যালেন্স: ৳${user ? user.balance : 0}\n💵 পার-ওটিপি রেট: ৳${rate}`);
});

bot.launch();
console.log('Telegram Bot with API Integration running successfully.');
