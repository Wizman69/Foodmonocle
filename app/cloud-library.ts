import type { ChatGPTUser } from "./chatgpt-auth";
import type { OpenFoodFactsNutrition } from "./open-food-facts";
import type { EvidenceFinding, ScanMode, ScanReport } from "./food-intelligence";

export type OwnerContext = {
  ownerId: string;
  email: string;
  displayName: string;
};

export type StoredProductInfo = {
  name?: string;
  brand?: string;
  barcode?: string;
  source?: string;
  sourceUrl?: string;
  sourceRetrievedAt?: string;
  labels?: string[];
  nutrition?: OpenFoodFactsNutrition;
};

export type CloudScanRecord = {
  id: string;
  ownerId: string;
  productName: string;
  barcode: string | null;
  source: ScanMode;
  sourceLabel: string;
  extractedText: string;
  productInfo: StoredProductInfo;
  evidence: EvidenceFinding[];
  analysis: ScanReport;
  isFavorite: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CloudComparison = {
  id: string;
  ownerId: string;
  name: string;
  leftScanId: string;
  rightScanId: string;
  comparisonData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CloudLibraryState = {
  scans: CloudScanRecord[];
  comparisons: CloudComparison[];
};

export type SyncPayload = {
  consentToSync?: boolean;
  scans?: Array<ScanReport | Partial<CloudScanRecord> | Record<string, unknown>>;
  comparisons?: Array<Partial<CloudComparison> | Record<string, unknown>>;
};

export type CloudLibraryStore = {
  list(ownerId: string): Promise<CloudLibraryState>;
  upsertScans(ownerId: string, scans: CloudScanRecord[]): Promise<void>;
  setFavorite(ownerId: string, scanId: string, isFavorite: boolean, updatedAt: string): Promise<void>;
  upsertComparisons(ownerId: string, comparisons: CloudComparison[]): Promise<void>;
  deleteScan(ownerId: string, scanId: string): Promise<void>;
  deleteAll(ownerId: string): Promise<void>;
};

const encoder = new TextEncoder();

function nowIso() {
  return new Date().toISOString();
}

function hexFrom(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export async function requireAuthenticatedOwner(
  user: ChatGPTUser | null,
  secret: string | undefined,
): Promise<OwnerContext> {
  if (!user?.email) {
    throw new Error("Sign in with ChatGPT is required for synchronized FoodMonocle records.");
  }
  if (!secret?.trim()) {
    throw new Error("FOODMONOCLE_OWNER_HMAC_SECRET must be configured for synchronized records.");
  }

  const email = normalizeEmail(user.email);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(email));

  return {
    ownerId: `fm_owner_${hexFrom(signature)}`,
    email,
    displayName: user.fullName || user.displayName || email,
  };
}

export function isLocalOnlyMode(owner: OwnerContext | null) {
  return owner === null;
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanBoolean(value: unknown) {
  return value === true || value === 1;
}

function cleanJsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asEvidenceList(value: unknown): EvidenceFinding[] {
  return Array.isArray(value) ? (value.filter((item) => item && typeof item === "object") as EvidenceFinding[]) : [];
}

function productInfoFrom(value: unknown, report: Partial<ScanReport>): StoredProductInfo {
  const info = cleanJsonObject(value);
  return {
    name: cleanString(info.name, cleanString(report.productName, "Saved food product")),
    brand: cleanString(info.brand) || undefined,
    barcode: cleanString(info.barcode, cleanString(report.barcode)) || undefined,
    source: cleanString(info.source) || undefined,
    sourceUrl: cleanString(info.sourceUrl) || undefined,
    sourceRetrievedAt: cleanString(info.sourceRetrievedAt) || undefined,
    labels: Array.isArray(info.labels) ? info.labels.filter((item): item is string => typeof item === "string") : undefined,
    nutrition: cleanJsonObject(info.nutrition) as OpenFoodFactsNutrition,
  };
}

export function cloudScanFromReport(
  report: Partial<ScanReport> & { productInfo?: Record<string, unknown>; isFavorite?: boolean },
  ownerId: string,
): CloudScanRecord {
  const createdAt = cleanString(report.createdAt, nowIso());
  const updatedAt = cleanString((report as { updatedAt?: string }).updatedAt, createdAt);
  const productName = cleanString(report.productName, "Saved food product");
  const source = (["photo", "barcode", "ingredients", "qr"].includes(String(report.source)) ? report.source : "ingredients") as ScanMode;
  const analysis = {
    ...report,
    id: cleanString(report.id, crypto.randomUUID()),
    productName,
    createdAt,
    input: cleanString(report.input),
    source,
    sourceLabel: cleanString(report.sourceLabel, "Saved label evidence"),
    clarityScore: typeof report.clarityScore === "number" ? report.clarityScore : 0,
    confidence: report.confidence === "High" || report.confidence === "Moderate" || report.confidence === "Low" ? report.confidence : "Low",
    bioengineered: report.bioengineered || "unclear",
    cultivated: report.cultivated || "unclear",
    digitalDisclosure: report.digitalDisclosure || "unclear",
    processingMarkers: Array.isArray(report.processingMarkers) ? report.processingMarkers : [],
    processingLevel: report.processingLevel ?? 0,
    processingLabel: cleanString(report.processingLabel, "Not enough evidence"),
    additives: Array.isArray(report.additives) ? report.additives : [],
    allergens: Array.isArray(report.allergens) ? report.allergens : [],
    labelClaims: Array.isArray(report.labelClaims) ? report.labelClaims : [],
    evidence: asEvidenceList(report.evidence),
    summary: cleanString(report.summary, "Saved FoodMonocle analysis."),
    productInfo: productInfoFrom(report.productInfo, report),
  } as ScanReport;

  return {
    id: analysis.id,
    ownerId,
    productName,
    barcode: cleanString(report.barcode) || null,
    source,
    sourceLabel: analysis.sourceLabel,
    extractedText: analysis.input,
    productInfo: productInfoFrom(report.productInfo, report),
    evidence: analysis.evidence,
    analysis,
    isFavorite: cleanBoolean(report.isFavorite),
    createdAt,
    updatedAt,
  };
}

function comparisonFrom(
  comparison: Partial<CloudComparison> | Record<string, unknown>,
  ownerId: string,
): CloudComparison {
  const createdAt = cleanString(comparison.createdAt, nowIso());
  return {
    id: cleanString(comparison.id, crypto.randomUUID()),
    ownerId,
    name: cleanString(comparison.name, "Saved comparison"),
    leftScanId: cleanString(comparison.leftScanId),
    rightScanId: cleanString(comparison.rightScanId),
    comparisonData: cleanJsonObject(comparison.comparisonData),
    createdAt,
    updatedAt: cleanString(comparison.updatedAt, createdAt),
  };
}

export async function syncLibraryForOwner(
  store: CloudLibraryStore,
  owner: OwnerContext,
  payload: SyncPayload,
): Promise<CloudLibraryState> {
  const scans = (payload.scans || []).map((item) => cloudScanFromReport(item as Partial<ScanReport>, owner.ownerId));
  const comparisons = (payload.comparisons || []).map((item) => comparisonFrom(item, owner.ownerId));
  if ((scans.length || comparisons.length) && payload.consentToSync !== true) {
    throw new Error("Explicit synchronization consent is required before uploading local FoodMonocle history.");
  }
  if (scans.length) await store.upsertScans(owner.ownerId, scans);
  if (comparisons.length) await store.upsertComparisons(owner.ownerId, comparisons);
  return store.list(owner.ownerId);
}

export function listLibraryForOwner(store: CloudLibraryStore, owner: OwnerContext) {
  return store.list(owner.ownerId);
}

export async function setFavoriteForOwner(
  store: CloudLibraryStore,
  owner: OwnerContext,
  scanId: string,
  isFavorite: boolean,
) {
  await store.setFavorite(owner.ownerId, scanId, isFavorite, nowIso());
  return store.list(owner.ownerId);
}

export async function saveComparisonForOwner(
  store: CloudLibraryStore,
  owner: OwnerContext,
  comparison: Partial<CloudComparison> | Record<string, unknown>,
) {
  await store.upsertComparisons(owner.ownerId, [comparisonFrom(comparison, owner.ownerId)]);
  return store.list(owner.ownerId);
}

export async function deleteScanForOwner(store: CloudLibraryStore, owner: OwnerContext, scanId: string) {
  await store.deleteScan(owner.ownerId, scanId);
  return store.list(owner.ownerId);
}

export async function deleteAllForOwner(store: CloudLibraryStore, owner: OwnerContext) {
  await store.deleteAll(owner.ownerId);
  return store.list(owner.ownerId);
}

export function mergeLocalAndCloudScans(localScans: ScanReport[], cloudScans: Array<ScanReport | CloudScanRecord>) {
  const merged = new Map<string, ScanReport>();
  for (const item of [...localScans, ...cloudScans]) {
    const report = "analysis" in item ? item.analysis : item;
    if (report?.id && !merged.has(report.id)) merged.set(report.id, report);
  }
  return [...merged.values()];
}

export function scanReportFromCloudRecord(record: CloudScanRecord): ScanReport {
  return {
    ...record.analysis,
    id: record.id,
    productName: record.productName,
    createdAt: record.createdAt,
    input: record.extractedText,
    source: record.source,
    sourceLabel: record.sourceLabel,
    barcode: record.barcode || undefined,
    productInfo: record.productInfo,
  } as ScanReport;
}

export function createMemoryCloudLibraryStore(): CloudLibraryStore {
  const scans = new Map<string, CloudScanRecord>();
  const comparisons = new Map<string, CloudComparison>();
  const keyFor = (ownerId: string, id: string) => `${ownerId}\n${id}`;

  return {
    async list(ownerId) {
      return {
        scans: [...scans.values()]
          .filter((item) => item.ownerId === ownerId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        comparisons: [...comparisons.values()]
          .filter((item) => item.ownerId === ownerId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      };
    },
    async upsertScans(ownerId, nextScans) {
      for (const scan of nextScans) {
        const key = keyFor(ownerId, scan.id);
        const existing = scans.get(key);
        scans.set(key, {
          ...scan,
          ownerId,
          isFavorite: existing?.isFavorite || scan.isFavorite,
          updatedAt: scan.updatedAt || nowIso(),
        });
      }
    },
    async setFavorite(ownerId, scanId, isFavorite, updatedAt) {
      const key = keyFor(ownerId, scanId);
      const existing = scans.get(key);
      if (existing) scans.set(key, { ...existing, ownerId, isFavorite, updatedAt });
    },
    async upsertComparisons(ownerId, nextComparisons) {
      for (const comparison of nextComparisons) {
        comparisons.set(keyFor(ownerId, comparison.id), { ...comparison, ownerId });
      }
    },
    async deleteScan(ownerId, scanId) {
      scans.delete(keyFor(ownerId, scanId));
      for (const [key, comparison] of comparisons) {
        if (comparison.ownerId === ownerId && (comparison.leftScanId === scanId || comparison.rightScanId === scanId)) {
          comparisons.delete(key);
        }
      }
    },
    async deleteAll(ownerId) {
      for (const key of scans.keys()) {
        if (key.startsWith(`${ownerId}\n`)) scans.delete(key);
      }
      for (const key of comparisons.keys()) {
        if (key.startsWith(`${ownerId}\n`)) comparisons.delete(key);
      }
    },
  };
}
