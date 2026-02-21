import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import type { WorkflowJson } from '@/types/canvas';

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

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('Untitled Project'),
  workflow_json: text('workflow_json', { mode: 'json' }).$type<WorkflowJson>(),
  thumbnail_path: text('thumbnail_path'),
  updated_at: integer('updated_at', { mode: 'number' }).notNull(),
  is_archived: integer('is_archived', { mode: 'boolean' }).default(false),
  is_template: integer('is_template', { mode: 'boolean' }).default(false),
  template_description: text('template_description'),
  template_source: text('template_source'),
});

export const cacheMetadata = sqliteTable('cache_metadata', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updated_at: integer('updated_at', { mode: 'number' }).notNull(),
});
