import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const libraryModule = new URL("../app/cloud-library.ts", import.meta.url);

async function loadLibrary() {
  return import(libraryModule.href);
}

function scan(overrides = {}) {
  return {
    id: overrides.id ?? "scan-1",
    productName: overrides.productName ?? "Colorful corn snack",
    createdAt: overrides.createdAt ?? "2026-07-14T22:00:00.000Z",
    input:
      overrides.input ??
      "Ingredients: corn meal, canola oil, yellow 5. Contains bioengineered food ingredients.",
    source: overrides.source ?? "barcode",
    sourceLabel: overrides.sourceLabel ?? "Open Food Facts community record retrieved Jul 14, 2026",
    clarityScore: overrides.clarityScore ?? 72,
    confidence: overrides.confidence ?? "Moderate",
    bioengineered: overrides.bioengineered ?? "found",
    cultivated: overrides.cultivated ?? "not-found",
    digitalDisclosure: overrides.digitalDisclosure ?? "not-found",
    barcode: overrides.barcode ?? "3017620422003",
    processingMarkers: overrides.processingMarkers ?? ["Synthetic color"],
    processingLevel: overrides.processingLevel ?? 1,
    processingLabel: overrides.processingLabel ?? "A few formulation markers",
    additives:
      overrides.additives ?? [
        {
          name: "Yellow 5",
          aliases: ["yellow 5"],
          purpose: "Synthetic color",
          note: "Adds yellow color.",
          family: "Color",
        },
      ],
    allergens: overrides.allergens ?? [],
    labelClaims: overrides.labelClaims ?? ["Bioengineered food disclosure"],
    evidence:
      overrides.evidence ?? [
        {
          id: "bioengineered",
          category: "Bioengineered disclosure",
          state: "found",
          headline: "Bioengineered disclosure wording found",
          evidence: "Contains bioengineered food ingredients",
          source: "Open Food Facts community record",
          confidence: "Moderate",
        },
      ],
    summary:
      overrides.summary ??
      "Label evidence includes a bioengineered-food disclosure. This is not a safety or dietary judgment.",
    productInfo: overrides.productInfo ?? {
      name: "Colorful corn snack",
      brand: "Acme Foods",
      barcode: "3017620422003",
      source: "Open Food Facts",
      sourceUrl: "https://world.openfoodfacts.org/product/3017620422003",
      sourceRetrievedAt: "2026-07-14T21:30:00.000Z",
      labels: ["Bioengineered food ingredients"],
      nutrition: { energyKcal100g: 510 },
    },
  };
}

test("derives opaque owner ids from authenticated email and HMAC secret", async () => {
  const { requireAuthenticatedOwner } = await loadLibrary();

  const first = await requireAuthenticatedOwner(
    { email: "USER@example.com", displayName: "User", fullName: null },
    "test-secret",
  );
  const second = await requireAuthenticatedOwner(
    { email: " user@example.com ", displayName: "User", fullName: null },
    "test-secret",
  );

  assert.equal(first.ownerId, second.ownerId);
  assert.match(first.ownerId, /^fm_owner_[a-f0-9]{64}$/);
  assert.equal(first.email, "user@example.com");
  assert.doesNotMatch(first.ownerId, /user|example/i);
});

test("rejects cloud operations without an authenticated user or HMAC secret", async () => {
  const { requireAuthenticatedOwner } = await loadLibrary();

  await assert.rejects(
    () => requireAuthenticatedOwner(null, "test-secret"),
    /Sign in with ChatGPT is required/,
  );
  await assert.rejects(
    () =>
      requireAuthenticatedOwner(
        { email: "user@example.com", displayName: "User", fullName: null },
        "",
      ),
    /FOODMONOCLE_OWNER_HMAC_SECRET/,
  );
});

test("synchronizes scans only after consent and deduplicates existing records", async () => {
  const {
    createMemoryCloudLibraryStore,
    requireAuthenticatedOwner,
    syncLibraryForOwner,
    listLibraryForOwner,
  } = await loadLibrary();
  const store = createMemoryCloudLibraryStore();
  const owner = await requireAuthenticatedOwner(
    { email: "sync@example.com", displayName: "Sync", fullName: null },
    "test-secret",
  );

  await assert.rejects(
    () => syncLibraryForOwner(store, owner, { consentToSync: false, scans: [scan()] }),
    /consent/i,
  );

  await syncLibraryForOwner(store, owner, { consentToSync: true, scans: [scan()] });
  await syncLibraryForOwner(store, owner, { consentToSync: true, scans: [scan()] });
  const library = await listLibraryForOwner(store, owner);

  assert.equal(library.scans.length, 1);
  assert.equal(library.scans[0].ownerId, owner.ownerId);
  assert.equal(library.scans[0].extractedText.includes("yellow 5"), true);
  assert.equal(library.scans[0].productInfo.brand, "Acme Foods");
  assert.equal(library.scans[0].analysis.summary.includes("safety"), true);
});

test("prevents two users from reading or changing each other's records", async () => {
  const {
    createMemoryCloudLibraryStore,
    requireAuthenticatedOwner,
    syncLibraryForOwner,
    setFavoriteForOwner,
    deleteScanForOwner,
    listLibraryForOwner,
  } = await loadLibrary();
  const store = createMemoryCloudLibraryStore();
  const ownerA = await requireAuthenticatedOwner(
    { email: "a@example.com", displayName: "A", fullName: null },
    "test-secret",
  );
  const ownerB = await requireAuthenticatedOwner(
    { email: "b@example.com", displayName: "B", fullName: null },
    "test-secret",
  );

  await syncLibraryForOwner(store, ownerA, {
    consentToSync: true,
    scans: [{ ...scan(), ownerId: ownerB.ownerId }],
  });
  await setFavoriteForOwner(store, ownerB, "scan-1", true);
  await deleteScanForOwner(store, ownerB, "scan-1");

  assert.equal((await listLibraryForOwner(store, ownerA)).scans.length, 1);
  assert.equal((await listLibraryForOwner(store, ownerA)).scans[0].isFavorite, false);
  assert.equal((await listLibraryForOwner(store, ownerB)).scans.length, 0);
});

test("saves and removes favorites for the authenticated owner", async () => {
  const {
    createMemoryCloudLibraryStore,
    requireAuthenticatedOwner,
    syncLibraryForOwner,
    setFavoriteForOwner,
    listLibraryForOwner,
  } = await loadLibrary();
  const store = createMemoryCloudLibraryStore();
  const owner = await requireAuthenticatedOwner(
    { email: "favorite@example.com", displayName: "Favorite", fullName: null },
    "test-secret",
  );

  await syncLibraryForOwner(store, owner, { consentToSync: true, scans: [scan()] });
  await setFavoriteForOwner(store, owner, "scan-1", true);
  assert.equal((await listLibraryForOwner(store, owner)).scans[0].isFavorite, true);

  await setFavoriteForOwner(store, owner, "scan-1", false);
  assert.equal((await listLibraryForOwner(store, owner)).scans[0].isFavorite, false);
});

test("saves and reopens product comparisons for the authenticated owner", async () => {
  const {
    createMemoryCloudLibraryStore,
    requireAuthenticatedOwner,
    syncLibraryForOwner,
    saveComparisonForOwner,
    listLibraryForOwner,
  } = await loadLibrary();
  const store = createMemoryCloudLibraryStore();
  const owner = await requireAuthenticatedOwner(
    { email: "compare@example.com", displayName: "Compare", fullName: null },
    "test-secret",
  );

  await syncLibraryForOwner(store, owner, {
    consentToSync: true,
    scans: [scan({ id: "scan-left" }), scan({ id: "scan-right", productName: "Simple corn chips" })],
  });
  await saveComparisonForOwner(store, owner, {
    id: "comparison-1",
    name: "Corn snack comparison",
    leftScanId: "scan-left",
    rightScanId: "scan-right",
    comparisonData: { note: "Evidence comparison only" },
    createdAt: "2026-07-14T23:00:00.000Z",
    updatedAt: "2026-07-14T23:00:00.000Z",
  });

  const library = await listLibraryForOwner(store, owner);
  assert.equal(library.comparisons.length, 1);
  assert.equal(library.comparisons[0].ownerId, owner.ownerId);
  assert.equal(library.comparisons[0].name, "Corn snack comparison");
  assert.deepEqual(library.comparisons[0].comparisonData, { note: "Evidence comparison only" });
});

test("deletes one record or all records for the authenticated owner only", async () => {
  const {
    createMemoryCloudLibraryStore,
    requireAuthenticatedOwner,
    syncLibraryForOwner,
    deleteScanForOwner,
    deleteAllForOwner,
    listLibraryForOwner,
  } = await loadLibrary();
  const store = createMemoryCloudLibraryStore();
  const ownerA = await requireAuthenticatedOwner(
    { email: "delete-a@example.com", displayName: "A", fullName: null },
    "test-secret",
  );
  const ownerB = await requireAuthenticatedOwner(
    { email: "delete-b@example.com", displayName: "B", fullName: null },
    "test-secret",
  );

  await syncLibraryForOwner(store, ownerA, {
    consentToSync: true,
    scans: [scan({ id: "a-1" }), scan({ id: "a-2" })],
  });
  await syncLibraryForOwner(store, ownerB, {
    consentToSync: true,
    scans: [scan({ id: "b-1" })],
  });

  await deleteScanForOwner(store, ownerA, "a-1");
  assert.deepEqual((await listLibraryForOwner(store, ownerA)).scans.map((item) => item.id), ["a-2"]);

  await deleteAllForOwner(store, ownerA);
  assert.equal((await listLibraryForOwner(store, ownerA)).scans.length, 0);
  assert.equal((await listLibraryForOwner(store, ownerB)).scans.length, 1);
});

test("signed-out mode keeps localStorage fallback and requires explicit sync consent", async () => {
  const { isLocalOnlyMode, mergeLocalAndCloudScans } = await loadLibrary();
  const local = [scan({ id: "local-1" })];
  const cloud = [scan({ id: "cloud-1" })];

  assert.equal(isLocalOnlyMode(null), true);
  assert.deepEqual(mergeLocalAndCloudScans(local, cloud).map((item) => item.id), ["local-1", "cloud-1"]);

  const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(pageSource, /foodmonocle-history/);
  assert.match(pageSource, /Sync local history/);
  assert.match(pageSource, /Local history stays on this device/);
});

test("database migration and Sites config declare the Phase 3 cloud library", () => {
  const hostingConfig = JSON.parse(readFileSync(new URL("../.openai/hosting.json", import.meta.url), "utf8"));
  const schemaSource = readFileSync(new URL("../db/schema.ts", import.meta.url), "utf8");
  const migrationSource = readFileSync(new URL("../drizzle/0000_phase3_cloud_library.sql", import.meta.url), "utf8");

  assert.equal(hostingConfig.d1, "DB");
  assert.equal(hostingConfig.r2, null);
  assert.match(schemaSource, /scanRecords/);
  assert.match(schemaSource, /productComparisons/);
  assert.match(schemaSource, /owner_id/);
  assert.match(migrationSource, /CREATE TABLE `scan_records`/);
  assert.match(migrationSource, /CREATE TABLE `product_comparisons`/);
  assert.match(migrationSource, /PRIMARY KEY\(`owner_id`,`id`\)/);
});
