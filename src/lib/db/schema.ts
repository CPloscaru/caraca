import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const modelsCache = sqliteTable('models_cache', {
  endpoint_id: text('endpoint_id').primaryKey(),
  category: text('category').notNull(),
  display_name: text('display_name').notNull(),
  group_key: text('group_key'),
  group_label: text('group_label'),
  thumbnail_url: text('thumbnail_url'),
  description: text('description'),
  highlighted: integer('highlighted', { mode: 'boolean' }).default(false),
  pinned: integer('pinned', { mode: 'boolean' }).default(false),
  duration_estimate: real('duration_estimate'),
  model_url: text('model_url'),
  raw_metadata: text('raw_metadata'),
});

export const cacheMetadata = sqliteTable('cache_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: integer('updated_at', { mode: 'number' }).notNull(),
});
