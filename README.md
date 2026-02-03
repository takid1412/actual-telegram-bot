## Actual Budget Telegram Bot

configure env file
```dotenv
ACTUAL_SERVER_URL=http://localhost:5006
ACTUAL_PASSWORD=your_actual_password
ACTUAL_SYNC_ID=your_budget_sync_id
ACTUAL_ACCOUNT_ID=your_account_id
TELEGRAM_BOT_TOKEN=your_telegram_token
```

run
```shell
pm2 start bot.js --name actual-bot
```