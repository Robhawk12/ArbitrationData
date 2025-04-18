import { pgTable, text, serial, integer, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User model (keeping from original)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Enum for case status
export const forumSourceEnum = pgEnum('forum_source', ['AAA', 'JAMS', 'OTHER']);
export const caseStatusEnum = pgEnum('case_status', ['COMPLETED', 'CLOSED', 'DUPLICATE', 'PENDING', 'OTHER']);
export const dispositionTypeEnum = pgEnum('disposition_type', ['AWARD', 'SETTLEMENT', 'WITHDRAWN', 'DISMISSED', 'OTHER']);

// Arbitration cases model
export const arbitrationCases = pgTable("arbitration_cases", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().unique(),
  forum: text("forum").notNull(),
  arbitratorName: text("arbitrator_name"),
  respondentName: text("respondent_name"),
  consumerAttorney: text("consumer_attorney"),
  filingDate: timestamp("filing_date"),
  disposition: text("disposition"),
  claimAmount: text("claim_amount"),
  awardAmount: text("award_amount"),
  caseType: text("case_type"),
  sourceFile: text("source_file").notNull(),
  processingDate: timestamp("processing_date").defaultNow().notNull(),
  hasDiscrepancies: boolean("has_discrepancies").default(false),
  duplicateOf: text("duplicate_of"),
  rawData: text("raw_data"),
});

export const insertArbitrationCaseSchema = createInsertSchema(arbitrationCases)
  .omit({ id: true, processingDate: true });

export type InsertArbitrationCase = z.infer<typeof insertArbitrationCaseSchema>;
export type ArbitrationCase = typeof arbitrationCases.$inferSelect;

// Processed files model
export const processedFiles = pgTable("processed_files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull().unique(),
  fileSize: integer("file_size").notNull(),
  processingDate: timestamp("processing_date").defaultNow().notNull(),
  recordsProcessed: integer("records_processed").notNull(),
  duplicatesFound: integer("duplicates_found").notNull().default(0),
  discrepanciesFound: integer("discrepancies_found").notNull().default(0),
  priority: integer("priority").notNull(),
  fileType: text("file_type").notNull(),
  status: text("status").notNull(),
});

export const insertProcessedFileSchema = createInsertSchema(processedFiles)
  .omit({ id: true, processingDate: true });

export type InsertProcessedFile = z.infer<typeof insertProcessedFileSchema>;
export type ProcessedFile = typeof processedFiles.$inferSelect;
