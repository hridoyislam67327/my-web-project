const axios = require('axios');

const API_KEY = process.env.OTP_API_KEY;
const BASE_URL = process.env.OTP_API_URL; // যেমন: https://sms-activate.org/stubs/handler_api.php বা 5sim API URL

// ১. প্রোভাইডার থেকে নতুন নম্বর রিকোয়েস্ট করা
async function getNumberFromProvider(service, country) {
  try {
    // উদাহরণস্বরূপ 5sim / SMS-Activate স্টাইল এপিআই কল:
    const response = await axios.get(`${BASE_URL}`, {
      params: {
        api_key: API_KEY,
        action: 'getNumber',
        service: service,  // e.g. 'fb', 'wa', 'tg'
        country: country   // e.g. 'myanmar', 'usa'
      }
    });

    // আপনার প্রোভাইডারের রেসপন্স ফরম্যাট অনুযায়ী নম্বর ও আইডি এক্সট্র্যাক্ট করা
    if (response.data && response.data.includes('ACCESS_NUMBER')) {
      const parts = response.data.split(':');
      return {
        success: true,
        orderId: parts[1],    // প্রোভাইডারের অর্ডার আইডি
        phoneNumber: parts[2] // প্রাপ্ত নম্বর (যেমন: 959686420106)
      };
    } else {
      return { success: false, message: response.data || "No numbers available" };
    }
  } catch (error) {
    console.error("API Get Number Error:", error.message);
    return { success: false, message: "API Server Error" };
  }
}

// ২. প্রোভাইডার থেকে ওটিপি কোড চেক করা (Code Fetch)
async function getOtpFromProvider(orderId) {
  try {
    const response = await axios.get(`${BASE_URL}`, {
      params: {
        api_key: API_KEY,
        action: 'getStatus',
        id: orderId
      }
    });

    if (response.data && response.data.includes('STATUS_OK')) {
      const otpCode = response.data.split(':')[1];
      return { success: true, otpCode: otpCode, fullMessage: `Your code is ${otpCode}` };
    } else if (response.data === 'STATUS_WAIT_CODE') {
      return { success: false, waiting: true, message: "Code not received yet" };
    } else {
      return { success: false, message: response.data };
    }
  } catch (error) {
    console.error("API Get OTP Error:", error.message);
    return { success: false, message: "API Error" };
  }
}

// ৩. নম্বর বাতিল / ক্যান্সেল করা (Switch Number / Cancel)
async function cancelNumberProvider(orderId) {
  try {
    await axios.get(`${BASE_URL}`, {
      params: {
        api_key: API_KEY,
        action: 'setStatus',
        status: 8, // 8 = Cancel order
        id: orderId
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false };
  }
}

module.exports = { getNumberFromProvider, getOtpFromProvider, cancelNumberProvider };
