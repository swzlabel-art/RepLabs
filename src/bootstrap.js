/**
 * bootstrap.js — runs before any other application module is loaded.
 *
 * Responsibilities:
 *  1. Ensure the logs/ directory exists so Winston's DailyRotateFile
 *     transports don't throw on first write (which would cause a silent exit).
 *  2. Print an early startup diagnostic block to stdout so container logs
 *     always show what environment the bot sees, even if it crashes during
 *     module initialisation.
 *  3. Fail fast with a clear error message if the absolute minimum required
 *     environment variables are absent.
 *
 * This module is imported via `import './bootstrap.js'` as the very first
 * statement in src/app.js so its top-level code runs before any other module
 * side-effects (logger setup, config validation, DB connection, etc.).
 */

import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---------------------------------------------------------------------------
// 1. Create logs/ directory
// ---------------------------------------------------------------------------
const logsDir = path.join(__dirname, '../logs');
try {
  mkdirSync(logsDir, { recursive: true });
} catch (err) {
  // Non-fatal — the console transport will still work even if file
  // transports fail, but we want to know about it.
  console.warn('[bootstrap] Could not create logs directory:', err.message);
}

// ---------------------------------------------------------------------------
// 2. Early startup diagnostics
// ---------------------------------------------------------------------------
const sep  = '='.repeat(60);
const dash = '-'.repeat(60);

console.log(sep);
console.log('[bootstrap] RepLabs bot — startup diagnostics');
console.log('[bootstrap] Timestamp    :', new Date().toISOString());
console.log('[bootstrap] Node.js      :', process.version);
console.log('[bootstrap] Environment  :', process.env.NODE_ENV || 'development');
console.log('[bootstrap] PID          :', process.pid);
console.log('[bootstrap] Working dir  :', process.cwd());
console.log(dash);
console.log('[bootstrap] DISCORD_TOKEN    :', process.env.DISCORD_TOKEN    ? '✅ set'                          : '❌ MISSING');
console.log('[bootstrap] TOKEN (fallback) :', process.env.TOKEN            ? '✅ set'                          : '   not set');
console.log('[bootstrap] CLIENT_ID        :', process.env.CLIENT_ID        ? '✅ set'                          : '❌ MISSING');
console.log('[bootstrap] GUILD_ID         :', process.env.GUILD_ID         ? '✅ set'                          : '   not set (global commands)');
console.log('[bootstrap] POSTGRES_HOST    :', process.env.POSTGRES_HOST    || '   not set (defaults to localhost)');
console.log('[bootstrap] POSTGRES_PORT    :', process.env.POSTGRES_PORT    || '   not set (defaults to 5432)');
console.log('[bootstrap] POSTGRES_DB      :', process.env.POSTGRES_DB      || '   not set (defaults to titanbot)');
console.log('[bootstrap] POSTGRES_USER    :', process.env.POSTGRES_USER    || '   not set (defaults to postgres)');
console.log('[bootstrap] POSTGRES_PASSWORD:', process.env.POSTGRES_PASSWORD ? '✅ set'                          : '❌ MISSING');
console.log('[bootstrap] PORT             :', process.env.PORT              || '   not set (defaults to 3000)');
console.log('[bootstrap] LOG_LEVEL        :', process.env.LOG_LEVEL         || '   not set (defaults to info/debug)');
console.log(sep);

// ---------------------------------------------------------------------------
// 3. Fail fast on missing critical env vars
// ---------------------------------------------------------------------------
const missingVars = [];
if (!process.env.DISCORD_TOKEN && !process.env.TOKEN) {
  missingVars.push('DISCORD_TOKEN');
}
if (!process.env.CLIENT_ID) {
  missingVars.push('CLIENT_ID');
}

if (missingVars.length > 0) {
  console.error('[bootstrap] ❌ FATAL — missing required environment variable(s):', missingVars.join(', '));
  console.error('[bootstrap]    Set these variables in your Railway service and redeploy.');
  process.exit(1);
}

console.log('[bootstrap] ✅ Required environment variables present — continuing startup.');
