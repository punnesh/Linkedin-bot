import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load system prompt from file
const systemPrompt = readFileSync(
  join(__dirname, '../prompts/system.md'),
  'utf-8'
);

// ── Provider config ───────────────────────────────────────────────────────────
const PROVIDERS = {
  gemini: {
    name: 'Google Gemini 2.5 Flash-Lite',
    model: 'gemini-2.5-flash-lite',
    envKey: 'GEMINI_API_KEY',
  },
  groq: {
    name: 'Groq (Llama 3.3 70B)',
    model: 'llama-3.3-70b-versatile',
    envKey: 'GROQ_API_KEY',
  },
};

const IMAGE_PROVIDERS = {
  pollinations: {
    name: 'Pollinations.ai (Flux)',
    envKey: null,
  },
  huggingface: {
    name: 'Hugging Face (SDXL)',
    model: 'stabilityai/stable-diffusion-xl-base-1.0',
    envKey: 'HF_API_KEY',
  },
};

// ── Post types rotation ───────────────────────────────────────────────────────
const POST_TYPES = ['STORY', 'INSIGHT', 'LIST', 'OPINION', 'QUESTION'];
let lastPostTypeIndex = -1;

function getNextPostType() {
  let index;
  do {
    index = Math.floor(Math.random() * POST_TYPES.length);
  } while (index === lastPostTypeIndex);
  lastPostTypeIndex = index;
  return POST_TYPES[index];
}

function getRandomTopic() {
  const topics = process.env.TOPICS
    ? process.env.TOPICS.split(',').map((t) => t.trim())
    : ['AI', 'Technology', 'Startups', 'Career Growth'];
  return topics[Math.floor(Math.random() * topics.length)];
}

// ── Provider resolution ───────────────────────────────────────────────────────

/**
 * Get the active provider config.
 * Reads AI_PROVIDER from env (defaults to 'gemini').
 */
function getProvider() {
  const key = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) {
    const valid = Object.keys(PROVIDERS).join(', ');
    throw new Error(
      `Unknown AI_PROVIDER "${key}". Valid options: ${valid}`
    );
  }
  if (!process.env[provider.envKey]) {
    throw new Error(
      `AI_PROVIDER is set to "${key}" but ${provider.envKey} is missing from .env`
    );
  }
  return { key, ...provider };
}

/**
 * Get the active image provider config.
 */
function getImageProvider() {
  const key = (process.env.IMAGE_PROVIDER || 'pollinations').toLowerCase();
  const provider = IMAGE_PROVIDERS[key];
  if (!provider) {
    return { key: 'pollinations', ...IMAGE_PROVIDERS.pollinations };
  }
  if (provider.envKey && !process.env[provider.envKey]) {
    console.warn(`⚠️ IMAGE_PROVIDER is set to "${key}" but ${provider.envKey} is missing. Falling back to pollinations.`);
    return { key: 'pollinations', ...IMAGE_PROVIDERS.pollinations };
  }
  return { key, ...provider };
}

// ── Provider implementations ──────────────────────────────────────────────────

async function generateWithGemini(userMessage) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: PROVIDERS.gemini.model,
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent(userMessage);
  return result.response.text();
}

async function generateWithGroq(userMessage) {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const completion = await client.chat.completions.create({
    model: PROVIDERS.groq.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1024,
    temperature: 0.85,
  });

  return completion.choices[0].message.content;
}

// ── Image Generation ──────────────────────────────────────────────────────────

async function generateHuggingFaceImage(prompt, model) {
  const url = `https://api-inference.huggingface.co/models/${model}`;
  
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.HF_API_KEY}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    body: JSON.stringify({ inputs: prompt }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generatePollinationsImage(prompt) {
  const safePrompt = encodeURIComponent(prompt);
  const url = `https://image.pollinations.ai/prompt/${safePrompt}?width=1080&height=1080&nologo=true&model=flux`;
  
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generates an image using the active image provider.
 * Uses Gemini as an Art Director to create the prompt based on the post.
 * @param {string} postText - The LinkedIn post text
 * @param {string} [feedback] - Optional user feedback for the image style
 * @param {string} [forcedProvider] - Override provider (e.g. from Telegram inline button)
 * @returns {Promise<Buffer|null>} The image buffer or null if failed
 */
export async function generateImageBuffer(postText, feedback = null, forcedProvider = null) {
  const providerEnvBackup = process.env.IMAGE_PROVIDER;
  if (forcedProvider) process.env.IMAGE_PROVIDER = forcedProvider;

  const imageProvider = getImageProvider();
  
  // Restore env
  process.env.IMAGE_PROVIDER = providerEnvBackup;

  try {
    let artDirectorPrompt = `You are an expert Art Director. Read this LinkedIn post and write a highly descriptive prompt for an AI image generator to create a matching illustration.\n\nPOST:\n${postText}\n\n`;
    
    if (feedback) {
      artDirectorPrompt += `\nUSER FEEDBACK: The user rejected the last image and gave this feedback: "${feedback}". Incorporate this feedback STRICTLY into your new prompt.\n`;
    } else {
      artDirectorPrompt += `\nSTYLE: Make it a clean, minimalist corporate vector art style. No text in the image.\n`;
    }
    
    artDirectorPrompt += `\nOutput ONLY the prompt text, nothing else.`;

    // Generate prompt with Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: PROVIDERS.gemini.model });
    const result = await model.generateContent(artDirectorPrompt);
    const imagePrompt = result.response.text().trim();

    console.log(`🎨 [${imageProvider.name}] Fetching image. Prompt: ${imagePrompt}`);
    
    if (imageProvider.key === 'huggingface') {
      return await generateHuggingFaceImage(imagePrompt, imageProvider.model);
    } else {
      return await generatePollinationsImage(imagePrompt);
    }
  } catch (err) {
    console.error(`❌ [${imageProvider.name}] Image generation failed:`, err.message);
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a LinkedIn post using the configured AI provider.
 * @param {string} [forcedTopic]    - Override topic
 * @param {string} [forcedType]     - Override post type (STORY, INSIGHT, etc.)
 * @param {string} [forcedProvider] - Override AI provider ('gemini' | 'groq')
 * @param {string[]} [recentPosts]  - Array of recent posts for context
 * @param {string} [previousPost]   - Previous draft text for revisions
 * @param {string} [userFeedback]   - User feedback for revisions
 * @returns {Promise<{ post: string, provider: string, topic: string, type: string, imageBuffer: Buffer|null }>}
 */
export async function generatePost(forcedTopic = null, forcedType = null, forcedProvider = null, recentPosts = [], previousPost = null, userFeedback = null) {
  // Allow per-call provider override (e.g. from Telegram inline button)
  const providerEnvBackup = process.env.AI_PROVIDER;
  if (forcedProvider) process.env.AI_PROVIDER = forcedProvider;

  const provider = getProvider();

  // Restore env after reading
  process.env.AI_PROVIDER = providerEnvBackup;

  const topic = forcedTopic || getRandomTopic();
  const postType = forcedType || getNextPostType();

  let contextString = '';
  if (recentPosts && recentPosts.length > 0) {
    contextString = `\n\nRecent posts you wrote (AVOID repeating these exact angles/topics):\n` + recentPosts.join('\n');
  }

  let feedbackString = '';
  if (previousPost && userFeedback) {
    feedbackString = `\n\n=== REVISION REQUEST ===\nHere is the previous draft you wrote:\n"""\n${previousPost}\n"""\n\nThe user provided the following feedback:\n"${userFeedback}"\n\nRewrite the draft exactly according to the user's feedback. Keep the core message but apply the changes requested.`;
  }

  const userMessage =
    `Write a LinkedIn post of type: ${postType}\n` +
    `Topic focus: ${topic}\n\n` +
    `Make it timely, highly specific, and genuinely useful to the reader. Don't be generic.${contextString}${feedbackString}`;

  console.log(`🤖 [${provider.name}] Generating ${postType} post about: ${topic}`);

  let postText = '';
  if (provider.key === 'gemini') {
    postText = await generateWithGemini(userMessage);
  } else if (provider.key === 'groq') {
    postText = await generateWithGroq(userMessage);
  }

  return { post: postText, provider: provider.name, topic, type: postType, imageBuffer: null };
}

/**
 * List all configured text providers.
 */
export function getAvailableProviders() {
  return Object.entries(PROVIDERS)
    .filter(([, cfg]) => !!process.env[cfg.envKey])
    .map(([key, cfg]) => ({ key, name: cfg.name, model: cfg.model }));
}

/**
 * Get the currently active text provider name.
 */
export function getActiveProviderName() {
  try {
    const p = getProvider();
    return p.name;
  } catch {
    return 'Not configured';
  }
}

/**
 * List all configured image providers.
 */
export function getAvailableImageProviders() {
  return Object.entries(IMAGE_PROVIDERS)
    .filter(([, cfg]) => !cfg.envKey || !!process.env[cfg.envKey])
    .map(([key, cfg]) => ({ key, name: cfg.name }));
}

/**
 * Get the currently active image provider name.
 */
export function getActiveImageProviderName() {
  const p = getImageProvider();
  return p.name;
}

/**
 * Ask the AI to propose 3-4 unique post topics based on recent context.
 * @param {string[]} [recentPosts] - Array of recent posts to avoid
 * @returns {Promise<Array<{topic: string, angle: string}>>}
 */
export async function proposeTopics(recentPosts = []) {
  const provider = getProvider();
  
  let contextString = '';
  if (recentPosts && recentPosts.length > 0) {
    contextString = `\nRecent posts written (AVOID these topics):\n` + recentPosts.join('\n');
  }

  const prompt = `You are a LinkedIn content strategist. Propose exactly 4 highly engaging, accessible topic angles for a LinkedIn post today.
The author is interested in business, technology, startups, and leadership.
CRITICAL: Do NOT output broad, generic categories like "AI" or "Product Management". Instead, pull inspiration from recent events, global business news, or relatable professional trends. 
HOWEVER, keep the topics highly accessible and relatable to a general professional audience. Do NOT make them overly complex, hyper-technical, or obscure. They should be interesting to everyday managers and tech enthusiasts.
The "topic" field should be a short, clear title (e.g., "The Remote Work Debate", "Recent AI Updates", "Startup Funding Shifts").
The "angle" field should be a conversational, relatable take on it.${contextString}

Format your response EXACTLY as a JSON array of objects, with no markdown formatting around it. Example:
[
  {"topic": "The push for Return to Office", "angle": "Why flexibility is becoming the ultimate hiring perk"},
  {"topic": "Recent AI announcements", "angle": "How AI is changing the daily workflow of a manager"}
]`;

  let responseText;
  if (provider.key === 'gemini') {
    responseText = await generateWithGemini(prompt);
  } else if (provider.key === 'groq') {
    responseText = await generateWithGroq(prompt);
  }

  try {
    // Strip markdown JSON blocks if present
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.error('Failed to parse topic proposals:', err);
    // Fallback topics
    return [
      { topic: "AI", angle: "Recent trend analysis" },
      { topic: "Startups", angle: "Lessons learned" },
      { topic: "Product Management", angle: "Core principles" }
    ];
  }
}
