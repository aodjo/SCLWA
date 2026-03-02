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

  db.run(`
    CREATE TABLE IF NOT EXISTS student_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_summary TEXT DEFAULT '',
      total_problems INTEGER DEFAULT 0,
      total_correct INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS problem_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      progress_id INTEGER,
      problem_index INTEGER,
      type TEXT,
      question TEXT,
      code TEXT,
      correct INTEGER,
      user_answer TEXT,
      hints_used INTEGER DEFAULT 0,
      chat_log TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (progress_id) REFERENCES student_progress(id)
    )
  `);

  migrateProblemHistorySchema();
  saveDatabase();
}

function hasColumn(tableName: string, columnName: string): boolean {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(`PRAGMA table_info(${tableName})`);

  let exists = false;
  while (stmt.step()) {
    const row = stmt.getAsObject() as { name: string };
    if (row.name === columnName) {
      exists = true;
      break;
    }
  }

  stmt.free();
  return exists;
}

function migrateProblemHistorySchema(): void {
  if (!db) throw new Error('Database not initialized');
  if (!hasColumn('problem_history', 'difficulty')) return;

  db.run('BEGIN TRANSACTION');
  try {
    db.run(`
      CREATE TABLE problem_history_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        progress_id INTEGER,
        problem_index INTEGER,
        type TEXT,
        question TEXT,
        code TEXT,
        correct INTEGER,
        user_answer TEXT,
        hints_used INTEGER DEFAULT 0,
        chat_log TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (progress_id) REFERENCES student_progress(id)
      )
    `);

    db.run(`
      INSERT INTO problem_history_new
      (id, progress_id, problem_index, type, question, code, correct, user_answer, hints_used, chat_log, created_at)
      SELECT id, progress_id, problem_index, type, question, code, correct, user_answer, hints_used, chat_log, created_at
      FROM problem_history
    `);

    db.run('DROP TABLE problem_history');
    db.run('ALTER TABLE problem_history_new RENAME TO problem_history');
    db.run('COMMIT');
  } catch (error) {
    db.run('ROLLBACK');
    throw error;
  }
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

interface ProblemRecord {
  id: number;
  type: string;
  question: string;
  code?: string;
  correct: boolean;
  userAnswer: string;
  hintsUsed: number;
  chatLog: { role: string; content: string }[];
}

interface StudentProgress {
  id: number;
  studentSummary: string;
  totalProblems: number;
  totalCorrect: number;
  history: ProblemRecord[];
}

/**
 * Gets or creates student progress record
 *
 * @returns Student progress with history
 */
export function getStudentProgress(): StudentProgress {
  if (!db) throw new Error('Database not initialized');

  const progressStmt = db.prepare('SELECT * FROM student_progress ORDER BY id DESC LIMIT 1');
  let progress: StudentProgress;

  if (progressStmt.step()) {
    const row = progressStmt.getAsObject() as {
      id: number;
      student_summary: string;
      total_problems: number;
      total_correct: number;
    };
    progress = {
      id: row.id,
      studentSummary: row.student_summary || '',
      totalProblems: row.total_problems,
      totalCorrect: row.total_correct,
      history: [],
    };
  } else {
    db.run('INSERT INTO student_progress (student_summary) VALUES ("")');
    const result = db.exec('SELECT last_insert_rowid() as id');
    progress = {
      id: result[0].values[0][0] as number,
      studentSummary: '',
      totalProblems: 0,
      totalCorrect: 0,
      history: [],
    };
    saveDatabase();
  }
  progressStmt.free();

  const historyStmt = db.prepare(
    'SELECT * FROM problem_history WHERE progress_id = ? ORDER BY problem_index'
  );
  historyStmt.bind([progress.id]);

  while (historyStmt.step()) {
    const row = historyStmt.getAsObject() as {
      id: number;
      type: string;
      question: string;
      code: string | null;
      correct: number;
      user_answer: string;
      hints_used: number;
      chat_log: string | null;
    };
    progress.history.push({
      id: row.id,
      type: row.type,
      question: row.question,
      code: row.code || undefined,
      correct: row.correct === 1,
      userAnswer: row.user_answer,
      hintsUsed: row.hints_used,
      chatLog: row.chat_log ? JSON.parse(row.chat_log) : [],
    });
  }
  historyStmt.free();

  return progress;
}

/**
 * Updates student progress summary and stats
 *
 * @param progress - Updated progress data
 */
export function saveStudentProgress(progress: StudentProgress): void {
  if (!db) throw new Error('Database not initialized');

  db.run(
    `UPDATE student_progress
     SET student_summary = ?, total_problems = ?, total_correct = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [progress.studentSummary, progress.totalProblems, progress.totalCorrect, progress.id]
  );

  saveDatabase();
}

/**
 * Saves a problem record to history
 *
 * @param progressId - Student progress ID
 * @param record - Problem record to save
 */
export function saveProblemRecord(progressId: number, record: ProblemRecord): void {
  if (!db) throw new Error('Database not initialized');

  db.run(
    `INSERT INTO problem_history
     (progress_id, problem_index, type, question, code, correct, user_answer, hints_used, chat_log)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      progressId,
      record.id,
      record.type,
      record.question,
      record.code || null,
      record.correct ? 1 : 0,
      record.userAnswer,
      record.hintsUsed,
      JSON.stringify(record.chatLog),
    ]
  );

  saveDatabase();
}

/**
 * Resets student progress for a new test
 *
 * @returns New progress ID
 */
export function resetStudentProgress(): StudentProgress {
  if (!db) throw new Error('Database not initialized');

  db.run('INSERT INTO student_progress (student_summary) VALUES ("")');
  const result = db.exec('SELECT last_insert_rowid() as id');

  saveDatabase();

  return {
    id: result[0].values[0][0] as number,
    studentSummary: '',
    totalProblems: 0,
    totalCorrect: 0,
    history: [],
  };
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
