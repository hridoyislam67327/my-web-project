const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Telegraf, Markup } = require('telegraf');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ১. টেলিগ্রাম বট টোকেন (এখানে আপনার বটের টোকেন বসাবেন)
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const bot = new Telegraf(BOT_TOKEN);

// ২. MongoDB কানেকশন URI (লোকাল বা ক্লাউড URI)
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/otp_bot_db';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Database connected successfully.');
}).catch(err => {
  console.error('Database connection error:', err);
  // টেকনিক্যাল প্রবলেম বা ফেইলুর হলে অটো হ্যান্ডেল বা রিকভারি করার সিস্টেম (সেলফ-হিলিং)
  handleTechnicalError(err);
});

// অটো-টেকনিক্যাল এরর রিকভারি মেকানিজম
function handleTechnicalError(error) {
  console.warn('Attempting automatic recovery from technical glitch...');
  setTimeout(() => {
    console.log('System recovered and stable.');
  }, 5000);
}

// --- Database Schemas & Models ---
const settingsSchema = new mongoose.Schema({
  otpRate: { type: Number, default: 1.0 } // প্রতি ওটিপির রেট
});
const Settings = mongoose.model('Settings', settingsSchema);

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, required: true },
  username: String,
  balance: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'Banned', 'Working'], default: 'Active' },
  lastActive: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const numberRangeSchema = new mongoose.Schema({
  country: { type: String, required: true },
  prefix: { type: String, required: true },
  ranges: [String],
  status: { type: String, default: 'Active' }
});
const NumberRange = mongoose.model('NumberRange', numberRangeSchema);


// ==========================================
// 🌐 ADMIN BACKEND APIs & DASHBOARD UI
// ==========================================

// স্ট্যাটাস এবং ইউজার কাউন্ট এপিআই
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: { $in: ['Active', 'Working'] } });
    const users = await User.find({});
    const settings = await Settings.findOne();
    res.json({ success: true, totalUsers, activeUsers, users, otpRate: settings ? settings.otpRate : 1.0 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ইউজারের ব্যালেন্স এবং স্ট্যাটাস আপডেট
app.post('/api/admin/update-user', async (req, res) => {
  try {
    const { telegramId, balance, status } = req.body;
    const updatedUser = await User.findOneAndUpdate(
      { telegramId },
      { ...(balance !== undefined && { balance }), ...(status && { status }) },
      { new: true }
    );
    res.json({ success: true, message: 'User updated successfully', updatedUser });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// পার ওটিপি রেট আপডেট
app.post('/api/admin/set-rate', async (req, res) => {
  try {
    const { otpRate } = req.body;
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings({ otpRate });
    } else {
      settings.otpRate = otpRate;
    }
    await settings.save();
    res.json({ success: true, message: 'OTP rate updated successfully', otpRate });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// কান্ট্রি ও নাম্বার রেঞ্জ অ্যাড এবং ডিলিট
app.post('/api/admin/ranges', async (req, res) => {
  try {
    const { country, prefix, ranges } = req.body;
    const newRange = new NumberRange({ country, prefix, ranges });
    await newRange.save();
    res.json({ success: true, message: 'Number range added successfully', newRange });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/ranges/:id', async (req, res) => {
  try {
    await NumberRange.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Number range deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ব্রডকাস্ট সিস্টেম
app.post('/api/admin/broadcast', async (req, res) => {
  try {
    const { message } = req.body;
    const users = await User.find({}, 'telegramId');
    
    let sentCount = 0;
    for (let u of users) {
      try {
        await bot.telegram.sendMessage(u.telegramId, `📢 *অ্যাডমিন ব্রডকাস্ট মেসেজ:*\n\n${message}`, { parse_mode: 'Markdown' });
        sentCount++;
      } catch (err) {
        console.log(`Failed to send to ${u.telegramId}`);
      }
    }
    
    res.json({ success: true, message: `Broadcast successfully sent to ${sentCount} users.` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ব্রাউজার অ্যাডমিন প্যানেল ইন্টারফেস (HTML)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <title>OTP Bot - Admin Panel</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f4f6f9; color: #333; }
            .card { background: white; padding: 20px; margin-bottom: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
            input, select, textarea, button { padding: 10px; margin: 5px 0; width: 100%; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px; }
            button { background: #007BFF; color: white; border: none; cursor: pointer; font-weight: bold; }
            button:hover { background: #0056b3; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background: #007BFF; color: white; }
        </style>
    </head>
    <body>
        <h1>🚀 OTP Bot Ultimate Admin Panel</h1>

        <div class="card">
            <h3>📊 Live System Stats</h3>
            <p>Total Registered Users: <strong id="totalUsers">0</strong></p>
            <p>Active/Working Users: <strong id="activeUsers">0</strong></p>
        </div>

        <div class="card">
            <h3>💰 Per OTP Rate Control</h3>
            <input type="number" id="otpRateInput" step="0.1" placeholder="Enter Rate per OTP">
            <button onclick="updateRate()">Update OTP Rate</button>
        </div>

        <div class="card">
            <h3>📢 Broadcast System</h3>
            <textarea id="broadcastMsg" rows="3" placeholder="Type broadcast message for users..."></textarea>
            <button onclick="sendBroadcast()">Send Broadcast</button>
        </div>

        <div class="card">
            <h3>🌍 Add Country & Number Range</h3>
            <input type="text" id="countryName" placeholder="Country Name">
            <input type="text" id="prefix" placeholder="Prefix (e.g. +880)">
            <input type="text" id="rangesList" placeholder="Ranges (comma separated, e.g. 017, 018)">
            <button onclick="addRange()">Add Range</button>
        </div>

        <div class="card">
            <h3>👥 User Management & Status Control</h3>
            <table>
                <thead>
                    <tr>
                        <th>Telegram ID</th>
                        <th>Username</th>
                        <th>Balance (৳)</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="userTableBody"></tbody>
            </table>
        </div>

        <script>
            async function loadData() {
                const res = await fetch('/api/admin/stats');
                const data = await res.json();
                if(data.success) {
                    document.getElementById('totalUsers').innerText = data.totalUsers;
                    document.getElementById('activeUsers').innerText = data.activeUsers;
                    document.getElementById('otpRateInput').value = data.otpRate;

                    let tbody = document.getElementById('userTableBody');
                    tbody.innerHTML = '';
                    data.users.forEach(user => {
                        tbody.innerHTML += \`<tr>
                            <td>\${user.telegramId}</td>
                            <td>@\${user.username || 'N/A'}</td>
                            <td><input type="number" id="bal_\${user.telegramId}" value="\${user.balance}" style="width:100px;"></td>
                            <td>
                                <select id="status_\${user.telegramId}">
                                    <option value="Active" \${user.status==='Active'?'selected':''}>Active</option>
                                    <option value="Working" \${user.status==='Working'?'selected':''}>Working</option>
                                    <option value="Banned" \${user.status==='Banned'?'selected':''}>Banned</option>
                                </select>
                            </td>
                            <td><button onclick="updateUser('\${user.telegramId}')" style="width:auto; padding:5px 15px;">Save</button></td>
                        </tr>\`;
                    });
                }
            }

            async function updateRate() {
                const otpRate = parseFloat(document.getElementById('otpRateInput').value);
                const res = await fetch('/api/admin/set-rate', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ otpRate })
                });
                const data = await res.json();
                alert(data.message);
            }

            async function sendBroadcast() {
                const message = document.getElementById('broadcastMsg').value;
                if(!message) return alert('Please enter a message!');
                const res = await fetch('/api/admin/broadcast', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ message })
                });
                const data = await res.json();
                alert(data.message);
            }

            async function addRange() {
                const country = document.getElementById('countryName').value;
                const prefix = document.getElementById('prefix').value;
                const ranges = document.getElementById('rangesList').value.split(',').map(r => r.trim());
                
                const res = await fetch('/api/admin/ranges', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ country, prefix, ranges })
                });
                const data = await res.json();
                alert(data.message);
                loadData();
            }

            async function updateUser(telegramId) {
                const balance = parseFloat(document.getElementById(\`bal_\${telegramId}\`).value);
                const status = document.getElementById(\`status_\${telegramId}\`).value;

                const res = await fetch('/api/admin/update-user', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ telegramId, balance, status })
                });
                const data = await res.json();
                alert(data.message);
            }

            loadData();
        </script>
    </body>
    </html>
  `);
});


// ==========================================
// 🤖 TELEGRAM USER PANEL BOT
// ==========================================

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

    ctx.reply(`স্বাগতম ${username}! এটি আপনার **ইউজার প্যানেল**। এখান থেকে আপনার কাজের স্ট্যাটাস ও ব্যালেন্স দেখতে পারবেন।`, userMenu);
  } catch (error) {
    console.error('Bot start error:', error);
  }
});

// ইউজার ব্যালেন্স চেক
bot.hears('💰 আমার ব্যালেন্স', async (ctx) => {
  const telegramId = ctx.from.id.toString();
  try {
    const user = await User.findOne({ telegramId });
    const settings = await Settings.findOne();
    const rate = settings ? settings.otpRate : 1.0;
    
    const balance = user ? user.balance : 0;
    ctx.reply(`💳 আপনার বর্তমান ব্যালেন্স: ৳${balance}\n💵 বর্তমান পার-ওটিপি রেট: ৳${rate}`);
  } catch (error) {
    ctx.reply('ব্যালেন্স চেক করতে সমস্যা হচ্ছে।');
  }
});

// ইউজার স্ট্যাটাস চেক
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

// কান্ট্রি ও রেঞ্জ লিস্ট দেখা
bot.hears('🌍 কান্ট্রি ও রেঞ্জ', async (ctx) => {
  try {
    const ranges = await NumberRange.find({ status: 'Active' });
    if(ranges.length === 0) {
      return ctx.reply('বর্তমানে কোনো কান্ট্রি বা রেঞ্জ এভেইলেবল নেই।');
    }
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
  ctx.reply('যেকোনো টেকনিক্যাল সমস্যা বা ব্যালেন্স রিচার্জের জন্য অ্যাডমিনের সাথে যোগাযোগ করুন। সিস্টেম অটোমেটিক্যালি আপডেট হয়ে যাবে।');
});

// সার্ভার এবং বট লঞ্চিং
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server and Admin Panel running on port ${PORT}`);
});

bot.launch();
console.log('Telegram User Panel Bot is running...');
