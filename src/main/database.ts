import initSqlJs, { Database } from 'sql.js';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DB_PATH = path.join(app.getPath('userData'), 'sclwa.db');

/** Encryption key generated from machine-specific path */
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(app.getPath('userData') + 'sclwa-secret-key')
  .digest();

const IV_LENGTH = 16;

/**
 * Encrypts text using AES-256-GCM
 *
 * @param text - Plain text to encrypt
 * @returns Base64 encoded encrypted string
 */
function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypts AES-256-GCM encrypted text
 *
 * @param encryptedText - Base64 encoded encrypted string
 * @returns Decrypted plain text
 */
function decrypt(encryptedText: string): string {
  const buffer = Buffer.from(encryptedText, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
  const encrypted = buffer.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

let db: Database | null = null;

/**
 * Initializes SQLite database and creates tables if not exist
 *
 * @returns Promise that resolves when database is ready
 */
export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_configs (
      provider TEXT PRIMARY KEY,
      api_key TEXT,
      enabled INTEGER DEFAULT 0
    )
  `);

  saveDatabase();
}

/**
 * Saves database to file
 */
function saveDatabase(): void {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

/**
 * Retrieves all AI configurations from database
 *
 * @returns Array of AI config objects with decrypted API keys
 */
export function getAIConfigs(): { provider: string; apiKey: string; enabled: boolean }[] {
  if (!db) throw new Error('Database not initialized');

  const stmt = db.prepare('SELECT provider, api_key, enabled FROM ai_configs');
  const rows: { provider: string; apiKey: string; enabled: boolean }[] = [];

  while (stmt.step()) {
    const row = stmt.getAsObject() as { provider: string; api_key: string | null; enabled: number };
    rows.push({
      provider: row.provider,
      apiKey: row.api_key ? decrypt(row.api_key) : '',
      enabled: row.enabled === 1,
    });
  }
  stmt.free();

  return rows;
}

/**
 * Saves or updates AI configuration in database
 *
 * @param provider - AI provider identifier
 * @param apiKey - API key (will be encrypted)
 * @param enabled - Whether this provider is enabled
 */
export function saveAIConfig(provider: string, apiKey: string, enabled: boolean): void {
  if (!db) throw new Error('Database not initialized');

  const encryptedKey = apiKey ? encrypt(apiKey) : null;

  db.run(
    `INSERT INTO ai_configs (provider, api_key, enabled)
     VALUES (?, ?, ?)
     ON CONFLICT(provider) DO UPDATE SET
       api_key = excluded.api_key,
       enabled = excluded.enabled`,
    [provider, encryptedKey, enabled ? 1 : 0]
  );

  saveDatabase();
}

/**
 * Closes the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
