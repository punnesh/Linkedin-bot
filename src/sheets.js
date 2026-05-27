import { google } from 'googleapis';
import { readFileSync } from 'fs';

// ── Column layout in the sheet ────────────────────────────────────────────────
// A: Date | B: Time | C: Day | D: AI Provider | E: Post Type | F: Topic | G: Post Content | H: Status

const SHEET_RANGE = 'Sheet1!A:H';
const HEADER_ROW  = ['Date', 'Time (IST)', 'Day', 'AI Provider', 'Post Type', 'Topic', 'Post Content', 'Status'];

let sheetsClient = null;

// ── Auth ──────────────────────────────────────────────────────────────────────

function getClient() {
  if (sheetsClient) return sheetsClient;

  const credPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!credPath) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set in .env');
  }

  // Support both a file path and an inline JSON string
  let credentials;
  try {
    // Try parsing as inline JSON string first
    credentials = JSON.parse(credPath);
  } catch {
    // Fall back to treating it as a file path
    credentials = JSON.parse(readFileSync(credPath, 'utf-8'));
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

// ── Setup (add header row if sheet is empty) ──────────────────────────────────

export async function ensureSheetHeaders() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID is not set in .env');

  try {
    const client  = getClient();

    // Read first row
    const res = await client.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A1:H1',
    });

    const firstRow = res.data.values?.[0];
    const hasHeaders = firstRow && firstRow[0] === 'Date';

    if (!hasHeaders) {
      await client.spreadsheets.values.update({
        spreadsheetId,
        range: 'Sheet1!A1:H1',
        valueInputOption: 'RAW',
        requestBody: { values: [HEADER_ROW] },
      });
      console.log('✅ Google Sheet: header row created.');
    } else {
      console.log('✅ Google Sheet: connected and ready.');
    }
  } catch (err) {
    console.warn(`⚠️  Google Sheet setup warning: ${err.message}`);
    console.warn('   Posts will still be generated and sent — just not saved to the sheet.');
  }
}

// ── Append a post row ─────────────────────────────────────────────────────────

/**
 * Save a generated post to the Google Sheet.
 * @param {{ post: string, provider: string, topic: string, type: string }} result
 * @param {string} [status] - e.g. 'Generated', 'Posted'
 */
export async function savePostToSheet(result, status = 'Generated') {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    console.warn('⚠️  GOOGLE_SHEET_ID not set — skipping sheet save.');
    return;
  }

  const now = new Date();
  const istOptions = { timeZone: 'Asia/Kolkata' };

  const date = now.toLocaleDateString('en-IN', { ...istOptions, day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = now.toLocaleTimeString('en-IN', { ...istOptions, hour: '2-digit', minute: '2-digit', hour12: true });
  const day  = now.toLocaleDateString('en-IN', { ...istOptions, weekday: 'long' });

  const row = [
    date,
    time,
    day,
    result.provider,
    result.type,
    result.topic,
    result.post,
    status,
  ];

  try {
    const client = getClient();
    await client.spreadsheets.values.append({
      spreadsheetId,
      range: SHEET_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });
    console.log(`📊 Post saved to Google Sheet (${result.provider} / ${result.topic})`);
  } catch (err) {
    console.error(`❌ Failed to save to Google Sheet: ${err.message}`);
    // Non-fatal — don't crash the bot
  }
}

// ── Fetch recent posts for context ────────────────────────────────────────────

/**
 * Fetch the last N posts from the Google Sheet to use as context.
 * @param {number} limit - Number of posts to fetch
 * @returns {Promise<string[]>} Array of post contents or topics
 */
export async function getRecentPosts(limit = 5) {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    return [];
  }

  try {
    const client = getClient();
    const res = await client.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!E:G', // E: Post Type, F: Topic, G: Post Content
    });

    const rows = res.data.values;
    if (!rows || rows.length <= 1) return []; // Only headers or empty

    // Skip header, get the last `limit` rows
    const recentRows = rows.slice(1).slice(-limit);
    
    return recentRows.map(row => {
      const type = row[0] || 'Unknown';
      const topic = row[1] || 'Unknown';
      const content = row[2] || '';
      return `Topic: ${topic} | Type: ${type} | Content Snippet: ${content.substring(0, 100)}...`;
    });
  } catch (err) {
    console.warn(`⚠️ Failed to fetch recent posts from Google Sheet: ${err.message}`);
    return [];
  }
}
