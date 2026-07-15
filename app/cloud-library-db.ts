import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "../db";
import { productComparisons, scanRecords } from "../db/schema";
import type { CloudComparison, CloudLibraryStore, CloudScanRecord } from "./cloud-library";

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") return value as T;
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function createD1CloudLibraryStore(db = getDb()): CloudLibraryStore {
  return {
    async list(ownerId) {
      const [scanRows, comparisonRows] = await Promise.all([
        db.select().from(scanRecords).where(eq(scanRecords.ownerId, ownerId)).orderBy(desc(scanRecords.updatedAt)),
        db
          .select()
          .from(productComparisons)
          .where(eq(productComparisons.ownerId, ownerId))
          .orderBy(desc(productComparisons.updatedAt)),
      ]);

      return {
        scans: scanRows.map((row) => ({
          id: row.id,
          ownerId: row.ownerId,
          productName: row.productName,
          barcode: row.barcode,
          source: row.source as CloudScanRecord["source"],
          sourceLabel: row.sourceLabel,
          extractedText: row.extractedText,
          productInfo: parseJson(row.productInfo, { name: row.productName }),
          evidence: parseJson(row.evidenceData, []),
          analysis: parseJson(row.analysisData, { id: row.id, productName: row.productName }),
          isFavorite: row.isFavorite === 1,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })) as unknown as CloudScanRecord[],
        comparisons: comparisonRows.map((row) => ({
          id: row.id,
          ownerId: row.ownerId,
          name: row.name,
          leftScanId: row.leftScanId,
          rightScanId: row.rightScanId,
          comparisonData: parseJson(row.comparisonData, {}),
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })) as CloudComparison[],
      };
    },
    async upsertScans(ownerId, scans) {
      for (const scan of scans) {
        await db
          .insert(scanRecords)
          .values({
            id: scan.id,
            ownerId,
            productName: scan.productName,
            barcode: scan.barcode,
            source: scan.source,
            sourceLabel: scan.sourceLabel,
            extractedText: scan.extractedText,
            productInfo: scan.productInfo,
            evidenceData: scan.evidence,
            analysisData: scan.analysis,
            isFavorite: scan.isFavorite ? 1 : 0,
            createdAt: scan.createdAt,
            updatedAt: scan.updatedAt,
          })
          .onConflictDoUpdate({
            target: [scanRecords.ownerId, scanRecords.id],
            set: {
              productName: scan.productName,
              barcode: scan.barcode,
              source: scan.source,
              sourceLabel: scan.sourceLabel,
              extractedText: scan.extractedText,
              productInfo: scan.productInfo,
              evidenceData: scan.evidence,
              analysisData: scan.analysis,
              updatedAt: scan.updatedAt,
            },
          });
      }
    },
    async setFavorite(ownerId, scanId, isFavorite, updatedAt) {
      await db
        .update(scanRecords)
        .set({ isFavorite: isFavorite ? 1 : 0, updatedAt })
        .where(and(eq(scanRecords.ownerId, ownerId), eq(scanRecords.id, scanId)));
    },
    async upsertComparisons(ownerId, comparisons) {
      for (const comparison of comparisons) {
        await db
          .insert(productComparisons)
          .values({
            id: comparison.id,
            ownerId,
            name: comparison.name,
            leftScanId: comparison.leftScanId,
            rightScanId: comparison.rightScanId,
            comparisonData: comparison.comparisonData,
            createdAt: comparison.createdAt,
            updatedAt: comparison.updatedAt,
          })
          .onConflictDoUpdate({
            target: [productComparisons.ownerId, productComparisons.id],
            set: {
              name: comparison.name,
              leftScanId: comparison.leftScanId,
              rightScanId: comparison.rightScanId,
              comparisonData: comparison.comparisonData,
              updatedAt: comparison.updatedAt,
            },
          });
      }
    },
    async deleteScan(ownerId, scanId) {
      await db
        .delete(productComparisons)
        .where(
          and(
            eq(productComparisons.ownerId, ownerId),
            or(eq(productComparisons.leftScanId, scanId), eq(productComparisons.rightScanId, scanId)),
          ),
        );
      await db.delete(scanRecords).where(and(eq(scanRecords.ownerId, ownerId), eq(scanRecords.id, scanId)));
    },
    async deleteAll(ownerId) {
      await db.delete(productComparisons).where(eq(productComparisons.ownerId, ownerId));
      await db.delete(scanRecords).where(eq(scanRecords.ownerId, ownerId));
    },
  };
}
