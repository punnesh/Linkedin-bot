import 'dotenv/config';
import { initBot } from './telegram.js';
import { startScheduler } from './scheduler.js';
import { ensureSheetHeaders } from './sheets.js';

// ── Validate required env vars ────────────────────────────────────────────────
const required = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error('❌ Missing required environment variables:');
  missing.forEach((key) => console.error(`   • ${key}`));
  console.error('\n📋 Copy .env.example to .env and fill in your values.');
  process.exit(1);
}

// At least one AI key must be present
if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
  console.error('❌ No AI provider key found. Set GEMINI_API_KEY or GROQ_API_KEY in .env');
  process.exit(1);
}

// Auto-select provider if only one key is present
if (!process.env.AI_PROVIDER) {
  process.env.AI_PROVIDER = process.env.GEMINI_API_KEY ? 'gemini' : 'groq';
}

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// ── Banner ────────────────────────────────────────────────────────────────────
console.log(`
╔══════════════════════════════════════════╗
║       LinkedIn AI Post Bot 🤖            ║
║  Powered by Claude + Telegram            ║
╚══════════════════════════════════════════╝
`);

// ── Start ─────────────────────────────────────────────────────────────────────
try {
  // Connect to Google Sheet (non-fatal if not configured)
  await ensureSheetHeaders();

  // Initialize Telegram bot (starts polling for commands)
  initBot();

  // Start the daily scheduler
  startScheduler(CHAT_ID);

  console.log(`✅ Bot is live! Open Telegram and send /start to your bot.`);
  console.log(`💡 Send /generate anytime to get a post immediately.\n`);
} catch (err) {
  console.error('❌ Failed to start bot:', err.message);
  process.exit(1);
}
