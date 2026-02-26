import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const sqlite = new Database(process.env.DATABASE_PATH || 'caraca.db');

export const db = drizzle({ client: sqlite, schema });
