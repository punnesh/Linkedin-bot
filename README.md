# 🤖 LinkedIn AI Post Bot

An AI-powered bot that generates polished LinkedIn posts daily using **Claude AI** and delivers them straight to your phone via **Telegram**. You just copy-paste and post.

---

## ✨ Features

- 🧠 **Claude AI** writes authentic, engaging LinkedIn posts
- 📱 **Telegram delivery** — posts sent to your phone every morning at 8 AM IST
- 🔄 **Regenerate** button to get a fresh post instantly
- 🎯 **Topic shortcuts** — one-tap to request AI, Startup, or PM focused posts
- `/generate` command — trigger a post anytime on demand
- `/topic <anything>` — request a post on any topic you want
- Rotates between: Story, Insight, List, Opinion, Question formats
- Topics: AI, Tech, Product Management, Startups, Business, Entrepreneurship, MBA

---

## 🚀 Setup (5 Steps)

### Step 1: Install dependencies
```bash
npm install
```

### Step 2: Get your Anthropic API key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account and generate an API key
3. Copy it — you'll need it in Step 4

### Step 3: Create your Telegram bot
1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name (e.g. "My LinkedIn Bot") and username (e.g. `mylinkedin_bot`)
4. Copy the **API token** BotFather gives you

### Step 4: Get your Telegram Chat ID
1. Start your new bot (click the link BotFather gives you or search for it)
2. Send `/start` to your bot
3. Visit this URL in your browser (replace `YOUR_TOKEN`):
   ```
   https://api.telegram.org/botYOUR_TOKEN/getUpdates
   ```
4. Find `"chat":{"id": 123456789}` — that number is your Chat ID

### Step 5: Configure and run
```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your keys
# Fill in: ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
```

Then start the bot:
```bash
npm start
```

---

## 📱 Telegram Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message + your Chat ID |
| `/generate` | Generate a post right now |
| `/topic AI` | Generate a post about AI |
| `/topic product management` | Generate a post about PM |
| `/help` | Show all commands |

---

## 📁 Project Structure

```
linkedin-bot/
├── src/
│   ├── index.js        ← Entry point
│   ├── generator.js    ← Claude AI content generation
│   ├── telegram.js     ← Telegram bot & message delivery
│   └── scheduler.js    ← Daily cron scheduler
├── prompts/
│   └── system.md       ← Master prompt shaping Claude's writing style
├── .env.example        ← Environment variable template
├── .env                ← Your actual keys (never commit this!)
└── package.json
```

---

## ⚙️ Customization

**Change posting time**: Edit `CRON_SCHEDULE` in `.env`
- `30 2 * * *` = 8:00 AM IST (default)
- `0 3 * * 1-5` = 8:30 AM IST, weekdays only
- Use [crontab.guru](https://crontab.guru) to build any schedule

**Change topics**: Edit the `TOPICS` list in `.env`

**Tune the writing style**: Edit `prompts/system.md` — this is the core prompt that controls Claude's voice, tone, and format.

---

## 🔒 Security

- Never commit your `.env` file (it's in `.gitignore`)
- Keep your API keys private
- The bot only responds to your configured `TELEGRAM_CHAT_ID`
