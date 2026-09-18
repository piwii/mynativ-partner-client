import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value').notNull() });
export const records = sqliteTable('records', { key: text('key').primaryKey(), kind: text('kind').notNull(), data: text('data').notNull() }, t => [index('idx_records_kind').on(t.kind)]);
export const events = sqliteTable('events', { id: text('id').primaryKey(), eventType: text('event_type').notNull(), commercialId: text('commercial_id'), travelId: integer('travel_id'), payload: text('payload').notNull(), receivedAt: text('received_at').notNull(), source: text('source').notNull() }, t => [index('idx_events_source_time').on(t.source, t.receivedAt)]);
