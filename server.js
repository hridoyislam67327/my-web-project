const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/otp_bot_db';

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Database connected successfully in server.js');
}).catch(err => {
  console.error('Database connection error:', err);
});

// --- Schemas & Models ---
const settingsSchema = new mongoose.Schema({
  otpRate: { type: Number, default: 1.0 }
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

// --- Admin APIs ---
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

app.post('/api/admin/set-rate', async (req, res) => {
  try {
    const { otpRate } = req.body;
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings({ otpRate });
    else settings.otpRate = otpRate;
    await settings.save();
    res.json({ success: true, message: 'OTP rate updated successfully', otpRate });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

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

// Admin Panel Web Interface (HTML)
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
        <h1>🚀 OTP Bot Admin Panel</h1>
        <div class="card">
            <h3>📊 System Stats</h3>
            <p>Total Users: <strong id="totalUsers">0</strong></p>
            <p>Active Users: <strong id="activeUsers">0</strong></p>
        </div>
        <div class="card">
            <h3>💰 Per OTP Rate Control</h3>
            <input type="number" id="otpRateInput" step="0.1">
            <button onclick="updateRate()">Update Rate</button>
        </div>
        <div class="card">
            <h3>🌍 Add Number Range</h3>
            <input type="text" id="countryName" placeholder="Country Name">
            <input type="text" id="prefix" placeholder="Prefix (+880)">
            <input type="text" id="rangesList" placeholder="Ranges (comma separated)">
            <button onclick="addRange()">Add Range</button>
        </div>
        <div class="card">
            <h3>👥 User Management</h3>
            <table>
                <thead>
                    <tr><th>Telegram ID</th><th>Username</th><th>Balance</th><th>Status</th><th>Action</th></tr>
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
                            <td><input type="number" id="bal_\${user.telegramId}" value="\${user.balance}" style="width:90px;"></td>
                            <td>
                                <select id="status_\${user.telegramId}">
                                    <option value="Active" \${user.status==='Active'?'selected':''}>Active</option>
                                    <option value="Working" \${user.status==='Working'?'selected':''}>Working</option>
                                    <option value="Banned" \${user.status==='Banned'?'selected':''}>Banned</option>
                                </select>
                            </td>
                            <td><button onclick="updateUser('\${user.telegramId}')" style="width:auto; padding:5px 12px;">Save</button></td>
                        </tr>\`;
                    });
                }
            }
            async function updateRate() {
                const otpRate = parseFloat(document.getElementById('otpRateInput').value);
                const res = await fetch('/api/admin/set-rate', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ otpRate }) });
                alert((await res.json()).message);
            }
            async function addRange() {
                const country = document.getElementById('countryName').value;
                const prefix = document.getElementById('prefix').value;
                const ranges = document.getElementById('rangesList').value.split(',').map(r => r.trim());
                const res = await fetch('/api/admin/ranges', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ country, prefix, ranges }) });
                alert((await res.json()).message);
                loadData();
            }
            async function updateUser(telegramId) {
                const balance = parseFloat(document.getElementById(\`bal_\${telegramId}\`).value);
                const status = document.getElementById(\`status_\${telegramId}\`).value;
                const res = await fetch('/api/admin/update-user', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ telegramId, balance, status }) });
                alert((await res.json()).message);
            }
            loadData();
        </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
