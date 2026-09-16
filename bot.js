require('dotenv').config();
const mongoose = require('mongoose');
const { Telegraf, Markup } = require('telegraf');

// Telegram Bot Token
const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN is missing in Environment Variables!");
  process.exit(1);
}
const bot = new Telegraf(BOT_TOKEN);

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing in Environment Variables!");
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Database connected successfully in bot.js'))
  .catch(err => console.error('❌ Bot Database connection error:', err));

// Models
const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, required: true },
  username: String,
  balance: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Banned', 'Working'], default: 'Active' },
  lastActive: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const settingsSchema = new mongoose.Schema({
  otpRate: { type: Number, default: 1.0 }
});
const Settings = mongoose.model('Settings', settingsSchema);

const numberRangeSchema = new mongoose.Schema({
  country: { type: String, required: true },
  prefix: { type: String, required: true },
  ranges: [String],
  status: { type: String, default: 'Active' }
});
const NumberRange = mongoose.model('NumberRange', numberRangeSchema);

// Bot Start & User Panel
bot.start(async (ctx) => {
  const telegramId = ctx.from.id.toString();
  const username = ctx.from.username || 'User';

  try {
    await User.findOneAndUpdate(
      { telegramId },
      { username, status: 'Active', lastActive: Date.now() },
      { upsert: true, new: true }
    );

    const userMenu = Markup.keyboard([
      ['💰 আমার ব্যালেন্স', '📊 কাজের স্ট্যাটাস'],
      ['🌍 কান্ট্রি ও রেঞ্জ', '⚙️ সাহায্য ও সাপোর্ট']
    ]).resize();

    ctx.reply(`স্বাগতম ${username}! এটি আপনার **ইউজার প্যানেল**।`, userMenu);
  } catch (error) {
    console.error('Bot start error:', error);
  }
});

bot.hears('💰 আমার ব্যালেন্স', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  try {
    const user = await User.findOne({ telegramId });
    const settings = await Settings.findOne();
    const rate = settings ? settings.otpRate : 1.0;
    const balance = user ? user.balance : 0;
    ctx.reply(`💳 আপনার বর্তমান ব্যালেন্স: ৳${balance}\n💵 প্রতি ওটিপি রেট: ৳${rate}`);
  } catch (error) {
    ctx.reply('ব্যালেন্স চেক করতে সমস্যা হচ্ছে।');
  }
});

bot.hears('📊 কাজের স্ট্যাটাস', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  try {
    const user = await User.findOne({ telegramId });
    const status = user ? user.status : 'Active';
    ctx.reply(`📌 আপনার বর্তমান কাজের স্ট্যাটাস: *${status}*`, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.reply('স্ট্যাটাস লোড করা যায়নি।');
  }
});

bot.hears('🌍 কান্ট্রি ও রেঞ্জ', async (ctx) => {
  try {
    const ranges = await NumberRange.find({ status: 'Active' });
    if(ranges.length === 0) return ctx.reply('বর্তমানে কোনো কান্ট্রি বা রেঞ্জ এভেইলেবল নেই।');
    let msg = '🌍 *এভেইলেবল কান্ট্রি ও নাম্বার রেঞ্জসমূহ:*\n\n';
    ranges.forEach(r => {
      msg += `🏳️ *${r.country}* (${r.prefix})\nরেঞ্জ: ${r.ranges.join(', ')}\n\n`;
    });
    ctx.reply(msg, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.reply('রেঞ্জ লোড করতে সমস্যা হয়েছে।');
  }
});

bot.hears('⚙️ সাহায্য ও সাপোর্ট', (ctx) => {
  ctx.reply('যেকোনো টেকনিক্যাল সমস্যা বা ব্যালেন্স রিচার্জের জন্য অ্যাডমিনের সাথে যোগাযোগ করুন।');
});

bot.launch();
console.log('Telegram User Panel Bot is running...');
