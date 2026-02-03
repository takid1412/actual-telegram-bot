process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const api = require('@actual-app/api');

(async () => {
  try {
    console.log(`Testing connection... ${process.env.ACTUAL_SERVER_URL}`);
    await api.init({ dataDir: './temp_data', serverURL: process.env.ACTUAL_SERVER_URL });
    console.log('Init OK.');
    let accounts = await api.getAccounts();
    console.log(accounts);
  } catch (e) {
    console.error('Error:', e);
  }
})();