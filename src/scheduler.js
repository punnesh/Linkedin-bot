import cron from 'node-cron';
import { sendDailyPost } from './telegram.js';

/**
 * Start the daily post scheduler
 * @param {string|number} chatId - Telegram chat ID to send posts to
 */
export function startScheduler(chatId) {
  const schedule = process.env.CRON_SCHEDULE || '30 2 * * *'; // Default: 8 AM IST

  if (!cron.validate(schedule)) {
    console.error(`❌ Invalid cron schedule: "${schedule}". Please check your .env file.`);
    process.exit(1);
  }

  console.log(`⏰ Scheduler started — posts will be sent on schedule: "${schedule}" (UTC)`);
  console.log(`   → That's 8:00 AM IST every day`);

  cron.schedule(schedule, async () => {
    const now = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    console.log(`\n📅 [${now}] Scheduler fired — generating daily post...`);
    await sendDailyPost(chatId);
  }, {
    timezone: 'UTC',
  });
}
