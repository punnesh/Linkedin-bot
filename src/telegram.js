import TelegramBot from 'node-telegram-bot-api';
import { generatePost, proposeTopics, getAvailableProviders, getActiveProviderName, generateImageBuffer, getAvailableImageProviders, getActiveImageProviderName } from './generator.js';
import { savePostToSheet, getRecentPosts } from './sheets.js';

let bot;

// Simple in-memory state mapping
const pendingPosts = new Map(); // chatId -> post result waiting to be saved
const proposedTopics = new Map(); // chatId -> array of proposals

// ── Keyboard helpers ──────────────────────────────────────────────────────────

function providerSwitchKeyboard() {
  return [
    [
      { text: '✨ Gemini', callback_data: 'switch:gemini' },
      { text: '⚡ Groq', callback_data: 'switch:groq' },
    ],
  ];
}

function postActionKeyboard() {
  return [
    [
      { text: '✅ Mark as Posted', callback_data: 'mark_posted' },
      { text: '🖼️ Generate Image', callback_data: 'generate_image' },
    ],
    [
      { text: '🔄 Regenerate', callback_data: 'regenerate' },
    ],
  ];
}

// ── Bot init ──────────────────────────────────────────────────────────────────

export function initBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set in .env');

  bot = new TelegramBot(token, { polling: true });

  bot.on('polling_error', (error) => {
    console.error(`[Polling Error] ${error.code}: ${error.message}`);
  });

  // Set the Telegram command menu
  bot.setMyCommands([
    { command: '/generate', description: 'Start topic proposal workflow' },
    { command: '/idea', description: 'Write a post about a specific topic (usage: /idea <topic>)' },
    { command: '/feedback', description: 'Edit the current post (usage: /feedback <notes>)' },
    { command: '/imagefeedback', description: 'Edit the generated image (usage: /imagefeedback <notes>)' },
    { command: '/provider', description: 'View & switch AI text provider' },
    { command: '/imageprovider', description: 'View & switch image provider' },
    { command: '/help', description: 'Show all commands' },
  ]);

  // /start
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const available = getAvailableProviders().map((p) => `• ${p.name}`).join('\n');
    const active = getActiveProviderName();

    bot.sendMessage(
      chatId,
      `👋 LinkedIn AI Post Bot is active!\n\n` +
      `I generate polished LinkedIn posts daily and send them here.\n` +
      `You copy-paste and post on LinkedIn.\n\n` +
      `🤖 Active AI: ${active}\n` +
      `📋 Available AIs:\n${available}\n\n` +
      `Commands:\n` +
      `/generate — Start topic proposal workflow\n` +
      `/provider — Switch AI provider\n` +
      `/help — All commands\n\n` +
      `Your Chat ID: ${chatId}`
    );
  });

  // /help
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
      chatId,
      `*LinkedIn Post Bot — Commands*\n\n` +
      `/generate — Start topic proposal workflow\n` +
      `/idea <topic> — Write a post about a specific topic\n` +
      `/feedback <notes> — Edit the current post\n` +
      `/imagefeedback <notes> — Edit the generated image\n` +
      `/provider — View & switch AI text provider\n` +
      `/imageprovider — View & switch image provider\n` +
      `/start — Welcome message\n` +
      `/help — This message`,
      { parse_mode: 'Markdown' }
    );
  });

  // /provider
  bot.onText(/\/provider/, (msg) => {
    const chatId = msg.chat.id;
    const active = getActiveProviderName();
    const available = getAvailableProviders();

    const availableText = available.length > 0
      ? available.map((p) => `• ${p.name} (${p.model})`).join('\n')
      : '• None configured — add API keys to .env';

    bot.sendMessage(
      chatId,
      `🤖 *AI Provider Settings*\n\n` +
      `*Currently active:* ${active}\n\n` +
      `*Available providers:*\n${availableText}\n\n` +
      `Tap a button to switch:`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: providerSwitchKeyboard() },
      }
    );
  });

  // /generate -> Start topic proposal
  bot.onText(/\/generate$/, async (msg) => {
    await initiateTopicProposal(msg.chat.id);
  });

  // /idea <topic> -> Bypass proposal
  bot.onText(/\/idea (.+)/, async (msg, match) => {
    await handleGenerate(msg.chat.id, match[1].trim());
  });

  // Keep legacy /topic for compatibility
  bot.onText(/\/topic (.+)/, async (msg, match) => {
    await handleGenerate(msg.chat.id, match[1].trim());
  });

  // /feedback <feedback> -> Revise pending post
  bot.onText(/\/feedback (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const feedback = match[1].trim();
    const pending = pendingPosts.get(chatId);
    
    if (!pending) {
      await bot.sendMessage(chatId, '⚠️ No pending post to revise. Generate one first using /generate or /idea.');
      return;
    }
    
    await bot.sendMessage(chatId, '🔄 Revising your post based on feedback...');
    await handleGenerate(chatId, pending.topic, pending.type, pending.post, feedback);
  });

  // /imagefeedback <feedback> -> Revise image
  bot.onText(/\/imagefeedback (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const feedback = match[1].trim();
    const pending = pendingPosts.get(chatId);
    
    if (!pending) {
      await bot.sendMessage(chatId, '⚠️ No pending post available.');
      return;
    }
    
    await bot.sendChatAction(chatId, 'upload_photo');
    await bot.sendMessage(chatId, '🎨 Generating new image based on your feedback...');
    
    const imageBuffer = await generateImageBuffer(pending.post, feedback);
    
    if (imageBuffer) {
      await bot.sendPhoto(chatId, imageBuffer, {
        caption: "Here is your updated image! 🖼️",
      });
    } else {
      await bot.sendMessage(chatId, '❌ Failed to generate image. Please try again.');
    }
  });

  // /imageprovider -> Show image provider options
  bot.onText(/\/imageprovider/, async (msg) => {
    const active = getActiveImageProviderName();
    const available = getAvailableImageProviders();

    const buttons = available.map((p) => [
      { text: `🖼️ Switch to ${p.name}`, callback_data: `img_provider_${p.key}` },
    ]);

    await bot.sendMessage(
      msg.chat.id,
      `*Active Image Provider:*\n🤖 ${active}\n\nSelect a new provider:`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }
    );
  });

  // ── Inline button callbacks ───────────────────────────────────────────────

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    // Switch active provider
    if (data.startsWith('switch:')) {
      const key = data.replace('switch:', '');
      process.env.AI_PROVIDER = key;
      const name = getActiveProviderName();
      await bot.answerCallbackQuery(query.id, { text: `✅ Switched to ${name}` }).catch(() => {});
      await bot.sendMessage(
        chatId,
        `✅ *AI provider switched to ${name}*\n\nNext generation will use this provider.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Switch image provider
    if (data.startsWith('img_provider_')) {
      const selected = data.replace('img_provider_', '');
      process.env.IMAGE_PROVIDER = selected;
      const active = getActiveImageProviderName();
      await bot.answerCallbackQuery(query.id, { text: `✅ Switched to ${active}` }).catch(() => {});
      await bot.editMessageText(`✅ *Image provider updated!*\nNow using: 🤖 ${active}`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown',
      }).catch(() => {});
      return;
    }

    // Topic selected from proposal
    if (data.startsWith('select_topic:')) {
      const index = parseInt(data.replace('select_topic:', ''), 10);
      const proposals = proposedTopics.get(chatId) || [];
      const selected = proposals[index];
      
      if (!selected) {
        await bot.answerCallbackQuery(query.id, { text: '⚠️ Session expired. Please /generate again.', show_alert: true }).catch(() => {});
        return;
      }

      const topicStr = `${selected.topic}: ${selected.angle}`;
      await bot.answerCallbackQuery(query.id, { text: `✍️ Writing...` }).catch(() => {});
      
      // Edit the proposal message to show selected topic instead of buttons
      await bot.editMessageText(`✅ Selected topic: *${topicStr}*`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }).catch(() => {});
      await handleGenerate(chatId, topicStr);
      return;
    }

    // Regenerate current pending post
    if (data === 'regenerate') {
      const pending = pendingPosts.get(chatId);
      const topic = pending ? pending.topic : null;
      await bot.answerCallbackQuery(query.id, { text: '🔄 Regenerating...' }).catch(() => {});
      await handleGenerate(chatId, topic);
      return;
    }

    // Generate image for pending post
    if (data === 'generate_image') {
      const pending = pendingPosts.get(chatId);
      if (!pending) {
        await bot.answerCallbackQuery(query.id, { text: '⚠️ Session expired.', show_alert: true }).catch(() => {});
        return;
      }
      
      await bot.answerCallbackQuery(query.id, { text: '🎨 Generating image...' }).catch(() => {});
      await bot.sendMessage(chatId, '🎨 Asking Art Director to design your image...');
      await bot.sendChatAction(chatId, 'upload_photo');
      
      const imageBuffer = await generateImageBuffer(pending.post);
      
      if (imageBuffer) {
        await bot.sendPhoto(chatId, imageBuffer, {
          caption: "Here is your image! 🖼️\nIf you want to change it, use `/imagefeedback <notes>`",
          parse_mode: 'Markdown'
        });
      } else {
        await bot.sendMessage(chatId, '❌ Failed to generate image. Please try again.');
      }
      return;
    }

    // Mark as Posted -> Save to Sheets
    if (data === 'mark_posted') {
      const pending = pendingPosts.get(chatId);
      if (!pending) {
        await bot.answerCallbackQuery(query.id, { text: '⚠️ Post expired or already saved.', show_alert: true }).catch(() => {});
        return;
      }
      
      await bot.answerCallbackQuery(query.id, { text: '💾 Saving to Google Sheets...' }).catch(() => {});
      
      try {
        await savePostToSheet(pending, 'Posted');
        pendingPosts.delete(chatId); // Clear state
        
        // Remove buttons
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
          chat_id: chatId,
          message_id: query.message.message_id
        }).catch(() => {});
        
        await bot.sendMessage(chatId, '✅ Saved to Google Sheets! Great job posting.');
      } catch (err) {
        await bot.sendMessage(chatId, '❌ Failed to save to Sheets: ' + err.message);
      }
      return;
    }
  });

  // Listen for "posted" text command to mark posted
  bot.on('message', async (msg) => {
    if (msg.text && msg.text.toLowerCase().trim() === 'posted') {
      const chatId = msg.chat.id;
      const pending = pendingPosts.get(chatId);
      if (pending) {
        await bot.sendMessage(chatId, '💾 Saving to Google Sheets...');
        try {
          await savePostToSheet(pending, 'Posted');
          pendingPosts.delete(chatId);
          await bot.sendMessage(chatId, '✅ Saved to Google Sheets! Great job posting.');
        } catch (err) {
          await bot.sendMessage(chatId, '❌ Failed to save to Sheets: ' + err.message);
        }
      }
    }
  });

  console.log('✅ Telegram bot is running and listening for commands...');
  return bot;
}

// ── Public ─────────────────────────────────────────────────────────────────

export async function sendDailyPost(chatId) {
  await initiateTopicProposal(chatId);
}

// ── Internal Workflows ────────────────────────────────────────────────────────

async function initiateTopicProposal(chatId) {
  await bot.sendChatAction(chatId, 'typing');
  
  const msg = await bot.sendMessage(
    chatId,
    `🔍 *Researching topics...*\n_Reviewing your recent posts..._`,
    { parse_mode: 'Markdown' }
  );

  try {
    const recentPosts = await getRecentPosts(5);
    const proposals = await proposeTopics(recentPosts);
    
    await bot.deleteMessage(chatId, msg.message_id).catch(() => {});

    if (!proposals || proposals.length === 0) {
      throw new Error("Failed to generate topic proposals.");
    }

    proposedTopics.set(chatId, proposals);

    const buttons = [];
    const buttonRow = [];
    
    let messageText = `💡 *Here are 4 highly-unique topic ideas for today.*\n_I've checked your recent posts to ensure these are new._\n\n`;
    
    proposals.forEach((p, index) => {
      messageText += `*${index + 1}. ${p.topic}*\n${p.angle}\n\n`;
      buttonRow.push({ text: `[ ${index + 1} ]`, callback_data: `select_topic:${index}` });
    });
    
    buttons.push(buttonRow); // All 4 buttons in one row

    await bot.sendMessage(
      chatId,
      messageText + `*Which one should we write about?* (Click a number below)`,
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
      }
    );
  } catch (err) {
    console.error('Error during proposal:', err);
    await bot.deleteMessage(chatId, msg.message_id).catch(() => {});
    await bot.sendMessage(chatId, `❌ Error proposing topics: ${err.message}\nFallback to /generate.`);
  }
}

async function handleGenerate(chatId, topic = null, type = null, previousPost = null, userFeedback = null) {
  await bot.sendChatAction(chatId, 'typing');

  const thinkingMsg = await bot.sendMessage(
    chatId,
    `🤖 *Writing your LinkedIn post...*`,
    { parse_mode: 'Markdown' }
  );

  try {
    const recentPosts = await getRecentPosts(5);
    const result = await generatePost(topic, type, null, recentPosts, previousPost, userFeedback);
    const { post, provider, topic: usedTopic, type: usedType } = result;

    await bot.deleteMessage(chatId, thinkingMsg.message_id).catch(() => {});

    // Save to memory waiting for "Posted" confirmation
    pendingPosts.set(chatId, result);

    const header =
      `📬 Your LinkedIn Post\n` +
      `🗓 ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} ` +
      `• 🤖 ${provider} • 📝 ${usedType}\n` +
      `${'─'.repeat(32)}\n\n`;

    const footer = `\n\n${'─'.repeat(32)}\nCopy the text above and paste it on LinkedIn! 🚀\nThen click [✅ Mark as Posted] to save to your Sheet.`;

    const textPayload = header + post + footer;

    // Send as text with new button options
    await bot.sendMessage(
      chatId,
      textPayload,
      {
        reply_markup: { inline_keyboard: postActionKeyboard() },
      }
    );
  } catch (err) {
    console.error('❌ Error generating post:', err.message);
    await bot.deleteMessage(chatId, thinkingMsg.message_id).catch(() => {});
    await bot.sendMessage(
      chatId,
      `❌ *Error:* \`${err.message}\`\n\nCheck your API key or try /provider to switch AI.`,
      { parse_mode: 'Markdown' }
    );
  }
}
