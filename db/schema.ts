import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const scanRecords = sqliteTable(
  "scan_records",
  {
    id: text("id").notNull(),
    ownerId: text("owner_id").notNull(),
    productName: text("product_name").notNull(),
    barcode: text("barcode"),
    source: text("source").notNull(),
    sourceLabel: text("source_label").notNull(),
    extractedText: text("extracted_text").notNull().default(""),
    productInfo: text("product_info", { mode: "json" }).notNull().default(sql`'{}'`),
    evidenceData: text("evidence_data", { mode: "json" }).notNull().default(sql`'[]'`),
    analysisData: text("analysis_data", { mode: "json" }).notNull().default(sql`'{}'`),
    isFavorite: integer("is_favorite").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index("scan_records_owner_updated_idx").on(table.ownerId, table.updatedAt),
    index("scan_records_owner_favorite_idx").on(table.ownerId, table.isFavorite),
    index("scan_records_owner_barcode_idx").on(table.ownerId, table.barcode),
  ],
);

export const productComparisons = sqliteTable(
  "product_comparisons",
  {
    id: text("id").notNull(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    leftScanId: text("left_scan_id").notNull(),
    rightScanId: text("right_scan_id").notNull(),
    comparisonData: text("comparison_data", { mode: "json" }).notNull().default(sql`'{}'`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.ownerId, table.id] }),
    index("product_comparisons_owner_updated_idx").on(table.ownerId, table.updatedAt),
  ],
);
