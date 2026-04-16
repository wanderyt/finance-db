import { sqliteTable, text, integer, real, index, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Users table
export const users = sqliteTable('users', {
  userId: integer('user_id').primaryKey(),
  username: text('username').notNull(),
  password: text('password').notNull()
}, (table) => ({
  usernameUnique: uniqueIndex('users_username_unique').on(table.username)
}));

// Categories table
export const categories = sqliteTable('categories', {
  userId: integer('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  category: text('category').notNull(),
  subcategory: text('subcategory').notNull(),
  appliesTo: text('applies_to').notNull().default('expense'),
  isCommon: integer('is_common', { mode: 'boolean' }).notNull().default(false)
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.category, table.subcategory] }),
  idxCategoriesUserApplies: index('idx_categories_user_applies').on(table.userId, table.appliesTo)
}));

// FX Snapshots table
export const fxSnapshots = sqliteTable('fx_snapshots', {
  fxId: integer('fx_id').primaryKey(),
  capturedAt: text('captured_at').notNull(),
  provider: text('provider'),
  baseCurrency: text('base_currency').notNull().default('CAD'),
  cadToUsd: real('cad_to_usd').notNull(),
  cadToCny: real('cad_to_cny').notNull()
}, (table) => ({
  idxFxCapturedAt: index('idx_fx_captured_at').on(table.capturedAt)
}));

// Persons table
export const persons = sqliteTable('persons', {
  personId: integer('person_id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
}, (table) => ({
  idxPersonsUser: index('idx_persons_user').on(table.userId),
  uniquePersonsUserName: uniqueIndex('unique_persons_user_name').on(table.userId, table.name)
}));

// Tags table
export const tags = sqliteTable('tags', {
  tagId: integer('tag_id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  name: text('name').notNull()
}, (table) => ({
  idxTagsUser: index('idx_tags_user').on(table.userId),
  uniqueTagsUserName: uniqueIndex('unique_tags_user_name').on(table.userId, table.name)
}));

// Schedule Rules table
export const scheduleRules = sqliteTable('schedule_rules', {
  scheduleRuleId: integer('schedule_rule_id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  name: text('name'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  interval: integer('interval').notNull(),
  unit: text('unit').notNull(),
  anchorDate: text('anchor_date').notNull()
}, (table) => ({
  idxScheduleRulesUserActive: index('idx_schedule_rules_user_active').on(table.userId, table.isActive)
}));

// Main Financial Transactions table
export const fin = sqliteTable('fin', {
  finId: text('fin_id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  type: text('type').notNull().default('expense'),
  date: text('date').notNull(),
  scheduledOn: text('scheduled_on'),
  scheduleRuleId: integer('schedule_rule_id').references(() => scheduleRules.scheduleRuleId, { onDelete: 'set null' }),
  merchant: text('merchant'),
  comment: text('comment'),
  place: text('place'),
  city: text('city'),
  category: text('category'),
  subcategory: text('subcategory'),
  details: text('details'),
  originalCurrency: text('original_currency').notNull(),
  originalAmountCents: integer('original_amount_cents').notNull(),
  fxId: integer('fx_id').references(() => fxSnapshots.fxId, { onDelete: 'set null' }),
  amountCadCents: integer('amount_cad_cents').notNull(),
  amountUsdCents: integer('amount_usd_cents').notNull(),
  amountCnyCents: integer('amount_cny_cents').notNull(),
  amountBaseCadCents: integer('amount_base_cad_cents').notNull(),
  isScheduled: integer('is_scheduled', { mode: 'boolean' }).notNull().default(false)
}, (table) => ({
  idxFinUserDate: index('idx_fin_user_date').on(table.userId, table.date),
  idxFinUserTypeDate: index('idx_fin_user_type_date').on(table.userId, table.type, table.date),
  idxFinUserCat: index('idx_fin_user_cat').on(table.userId, table.category, table.subcategory),
  idxFinUserMerchant: index('idx_fin_user_merchant').on(table.userId, table.merchant),
  idxFinUserFx: index('idx_fin_user_fx').on(table.userId, table.fxId),
  idxFinUserRuleScheduledOn: index('idx_fin_user_rule_scheduled_on').on(table.userId, table.scheduleRuleId, table.scheduledOn),
  uxFinRuleDay: uniqueIndex('ux_fin_rule_day').on(table.userId, table.scheduleRuleId, table.scheduledOn)
    .where(sql`schedule_rule_id IS NOT NULL AND scheduled_on IS NOT NULL`)
}));

// Financial Transaction Items table
export const finItems = sqliteTable('fin_items', {
  itemId: integer('item_id').primaryKey(),
  finId: text('fin_id').notNull().references(() => fin.finId, { onDelete: 'cascade' }),
  lineNo: integer('line_no'),
  name: text('name').notNull(),
  qty: real('qty'),
  unit: text('unit'),
  unitPriceCents: integer('unit_price_cents'),
  originalAmountCents: integer('original_amount_cents').notNull(),
  personId: integer('person_id').references(() => persons.personId, { onDelete: 'set null' }),
  category: text('category'),
  subcategory: text('subcategory'),
  notes: text('notes')
}, (table) => ({
  idxItemsFin: index('idx_items_fin').on(table.finId),
  idxItemsPerson: index('idx_items_person').on(table.personId)
}));

// Financial Transaction Tags junction table
export const finTags = sqliteTable('fin_tags', {
  finId: text('fin_id').notNull().references(() => fin.finId, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.tagId, { onDelete: 'cascade' })
}, (table) => ({
  pk: primaryKey({ columns: [table.finId, table.tagId] }),
  idxFinTagsTag: index('idx_fin_tags_tag').on(table.tagId)
}));

// Receipts table
export const receipts = sqliteTable('receipts', {
  receiptId: integer('receipt_id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.userId, { onDelete: 'cascade' }),
  finId: text('fin_id').references(() => fin.finId, { onDelete: 'set null' }),
  filePath: text('file_path').notNull(),
  mimeType: text('mime_type'),
  sha256: text('sha256'),
  uploadedAt: text('uploaded_at').notNull()
}, (table) => ({
  idxReceiptsUser: index('idx_receipts_user').on(table.userId),
  idxReceiptsFin: index('idx_receipts_fin').on(table.finId),
  idxReceiptsSha256: uniqueIndex('idx_receipts_sha256').on(table.sha256)
}));

// Pocket Money table
export const pocketMoney = sqliteTable('pocket_money', {
  pocketMoneyId: integer('pocket_money_id').primaryKey(),
  personId: integer('person_id').notNull().references(() => persons.personId, { onDelete: 'cascade' }),
  transactionDate: text('transaction_date').notNull(),
  amountCents: integer('amount_cents').notNull(),
  transactionType: text('transaction_type').notNull().$type<'initial' | 'weekly_allowance' | 'bonus' | 'deduction' | 'expense' | 'red_pocket'>(),
  reason: text('reason').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  createdBy: text('created_by').notNull().default('system')
}, (table) => ({
  idxPocketMoneyPerson: index('idx_pocket_money_person').on(table.personId),
  idxPocketMoneyDate: index('idx_pocket_money_date').on(table.transactionDate),
  idxPocketMoneyType: index('idx_pocket_money_type').on(table.transactionType)
}));

// Pocket Money Job State table
export const pocketMoneyJobState = sqliteTable('pocket_money_job_state', {
  jobId: integer('job_id').primaryKey(),
  jobName: text('job_name').notNull(),
  lastRunDate: text('last_run_date').notNull(),
  lastSuccessDate: text('last_success_date').notNull(),
  runCount: integer('run_count').notNull().default(0),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
}, (table) => ({
  uniqueJobName: uniqueIndex('unique_job_name').on(table.jobName)
}));

// Type exports for use in application
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

export type FxSnapshot = typeof fxSnapshots.$inferSelect;
export type NewFxSnapshot = typeof fxSnapshots.$inferInsert;

export type Person = typeof persons.$inferSelect;
export type NewPerson = typeof persons.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type ScheduleRule = typeof scheduleRules.$inferSelect;
export type NewScheduleRule = typeof scheduleRules.$inferInsert;

export type Fin = typeof fin.$inferSelect;
export type NewFin = typeof fin.$inferInsert;

export type FinItem = typeof finItems.$inferSelect;
export type NewFinItem = typeof finItems.$inferInsert;

export type FinTag = typeof finTags.$inferSelect;
export type NewFinTag = typeof finTags.$inferInsert;

export type Receipt = typeof receipts.$inferSelect;
export type NewReceipt = typeof receipts.$inferInsert;

export type PocketMoney = typeof pocketMoney.$inferSelect;
export type NewPocketMoney = typeof pocketMoney.$inferInsert;

export type PocketMoneyJobState = typeof pocketMoneyJobState.$inferSelect;
export type NewPocketMoneyJobState = typeof pocketMoneyJobState.$inferInsert;
