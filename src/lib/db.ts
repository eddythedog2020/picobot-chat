import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Ensure the data directory exists
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'picobot.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    apiBaseUrl TEXT NOT NULL,
    apiKey TEXT NOT NULL,
    defaultModel TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    updatedAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chatId TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    FOREIGN KEY(chatId) REFERENCES chats(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );
`);

// Insert default settings if undefined
const defaultSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
if (!defaultSettings) {
  db.prepare('INSERT INTO settings (id, apiBaseUrl, apiKey, defaultModel) VALUES (1, ?, ?, ?)').run(
    'http://localhost:11434/v1',
    'picobot-local',
    'llama3'
  );
}

// Migrations: add columns safely
try { db.exec(`ALTER TABLE chats ADD COLUMN compactedSummary TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE chats ADD COLUMN compactedAtIndex INTEGER`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN preferLlmSearch INTEGER`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE messages ADD COLUMN images TEXT`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN allowCodeExecution INTEGER DEFAULT 0`); } catch { /* already exists */ }
try { db.exec(`ALTER TABLE settings ADD COLUMN authToken TEXT`); } catch { /* already exists */ }

// MCP servers table
db.exec(`
  CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    command TEXT NOT NULL,
    args TEXT NOT NULL DEFAULT '[]',
    env TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER DEFAULT 1,
    createdAt INTEGER NOT NULL
  );
`);

// Auth token is set during the onboarding flow — not auto-generated on startup.
// When no token is configured, the auth middleware allows all requests (first-run state).

export default db;
