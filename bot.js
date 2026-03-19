process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const api = require('@actual-app/api');
const { Telegraf } = require('telegraf');
const {message} = require("telegraf/filters");

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const fmt = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

const getDateString = (date) => date.toISOString().split('T')[0];

function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(d.setDate(diff));
}

async function getPeriodStats(accountId, startDate, endDate) {
  const transactions = await api.getTransactions(accountId, startDate, endDate);

  let income = 0;
  let expense = 0;

  transactions.forEach(t => {
    const realAmount = api.utils.integerToAmount(t.amount);
    if (realAmount > 0) income += realAmount;
    if (realAmount < 0) expense += realAmount;
  });

  return {
    income,
    expense,
    balance: income + expense
  };
}

async function initActual() {
  console.log('Connecting to Actual...');
  const dataDir = path.join(__dirname, 'data');

  if (!fs.existsSync(dataDir)){
    fs.mkdirSync(dataDir, { recursive: true });
  }
  await api.init({
    dataDir: dataDir,
    serverURL: process.env.ACTUAL_SERVER_URL,
    password: process.env.ACTUAL_PASSWORD,
  });

  await api.downloadBudget(process.env.ACTUAL_SYNC_ID);
  console.log('Budget synced.');

  let accounts = await api.getAccounts();

  console.log("Accounts: \n" + accounts.map(a => `${a.name}: \`${a.id}\``).join('\n') );
}

async function getBalanceMarkdown(includeDetail = false) {
  const today = new Date();
  const todayStr = getDateString(today);

  const startOfWeek = getMonday(today);
  const statsWeek = await getPeriodStats(process.env.ACTUAL_ACCOUNT_ID, getDateString(startOfWeek), todayStr);

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const statsMonth = await getPeriodStats(process.env.ACTUAL_ACCOUNT_ID, getDateString(startOfMonth), todayStr);

  return `*Week:* ${fmt(statsWeek['balance'])}\n` +
    `*Month:* ${fmt(statsMonth['balance'])}\n` +
    includeDetail?`*Detail:* +${fmt(statsMonth['income'])} ${fmt(statsMonth['expense'])}\n`:'';
}

bot.command(['balance', 'bl'], async (ctx) => {
  const balance = await getBalanceMarkdown(true);
  ctx.replyWithMarkdown(balance);
});

bot.on(message('text'), async (ctx) => {
  const text = ctx.message.text.trim();
  const regex = /^(.*)\s+([+\-]?\d+(?:[.,]\d+)?[kKmM])/;
  const match = text.match(regex);
  if(!match || text.startsWith("/")) return ctx.replyWithMarkdown('*Invalid Format*\n*Usage:* note 123(k|m) or 123(k|m) note');

  let rawAmountStr = match[2].toLowerCase();
  let multiplier = 1e3;

  if (rawAmountStr.endsWith('m')) {
    multiplier = 1e6;
  }
  let amount = parseFloat(rawAmountStr.slice(0, -1).replace(/[+\-]/g, '')) * multiplier;

  if(rawAmountStr.startsWith('+')){
    amount = Math.abs(amount);
  }else{
    amount = -Math.abs(amount);
  }

  const note = text.replace(rawAmountStr, '').replace(/\s+/g, ' ');

  try {
    const today = new Date();
    const todayStr = getDateString(today);
    await api.addTransactions(process.env.ACTUAL_ACCOUNT_ID, [{
      date: todayStr,
      amount: api.utils.amountToInteger(amount),
      payee_name: "Actual Bot",
      notes: note,
      cleared: true
    }]);

    await api.sync();

    const balance = await getBalanceMarkdown();
    ctx.replyWithMarkdown(`*Recorded:* ${fmt(amount)}\n${balance}`);

  } catch (e) {
    console.error(e);
    ctx.reply(`Error: ${e.message}`);
  }
});

const fixTrans = async()=>{
  const transactions = await api.getTransactions(process.env.ACTUAL_ACCOUNT_ID, '2000-01-01', '2099-12-31');

  for (const t of transactions) {
    if (t.imported_payee === 'Actual Bot') {
      await api.updateTransaction(t.id, { amount: t.amount * 100 });
    }
  }

  await api.sync();
  console.log('Transactions updated.');
};

async function setCommands(){
  await bot.telegram.setMyCommands([
    { command: 'balance', description: 'Get current month balance' },
  ]);
}

(async () => {
  try {
    await initActual();
    await setCommands();
    // await fixTrans();
    // console.log(await getBalanceMarkdown());
    await bot.launch();
    console.log('Bot started.');

    // Enable graceful stop
    process.once('SIGINT', () => { bot.stop('SIGINT'); api.shutdown(); });
    process.once('SIGTERM', () => { bot.stop('SIGTERM'); api.shutdown(); });
  } catch (e) {
    console.error('Start failed:', e);
  }
})();