import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const sqlite = new Database(process.env.DATABASE_PATH || 'caraca.db');

// Ensure tables exist without requiring drizzle-kit push
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS favorite_models (
    endpoint_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
  )
`);

export const db = drizzle({ client: sqlite, schema });
