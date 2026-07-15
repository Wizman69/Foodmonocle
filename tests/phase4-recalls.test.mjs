import assert from "node:assert/strict";
import test from "node:test";

const moduleUrl = new URL("../app/recall-engine.ts", import.meta.url);

async function loadRecallEngine() {
  return import(moduleUrl.href);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fdaBlueberryRecall = {
  recall_number: "H-0859-2026",
  event_id: "98765",
  product_description: "Cafe Nouria blueberry muffin, 6 oz. UPC: 811070033986. Best by 08/01/2026.",
  reason_for_recall: "Product may contain undeclared milk.",
  recalling_firm: "The Brownie Baker Inc.",
  classification: "Class I",
  status: "Ongoing",
  report_date: "20260610",
  recall_initiation_date: "20260603",
  distribution_pattern: "MA and NH",
  code_info: "Lot: 6082; Best by 08/01/2026",
  product_type: "Food",
};

const fsisChickenRecall = {
  field_recall_number: "022-2026",
  field_title: "Acme Meats recalls ready-to-eat chicken products",
  field_recall_classification: "Class I",
  field_recall_type: "Active Recall",
  field_recall_date: "2026-07-10",
  field_summary: "Ready-to-eat chicken products are subject to recall.",
  field_recall_reason: "Possible contamination identified by the establishment.",
  field_processing: "Poultry; ready-to-eat",
  field_product_items: "Acme chicken bites, 12 oz, UPC 012345678905, lot L2401, use by 09/15/2026",
  field_establishment: "Acme Meats, EST. P-1234",
  field_states: "Nationwide",
  field_recall_url: "https://www.fsis.usda.gov/recalls-alerts/acme-meats-recalls-chicken-products",
  field_last_modified_date: "2026-07-11T14:15:00Z",
};

function sourceFetch({ fda = [fdaBlueberryRecall], fsis = [fsisChickenRecall], fdaStatus = 200, fsisStatus = 200 } = {}) {
  return async (url) => {
    const href = url.toString();
    if (href.startsWith("https://api.fda.gov/")) {
      if (fdaStatus === 404) return jsonResponse({ error: { code: "NOT_FOUND" } }, 404);
      if (fdaStatus !== 200) return jsonResponse({ error: "FDA unavailable" }, fdaStatus);
      return jsonResponse({ meta: { last_updated: "2026-07-12" }, results: fda });
    }
    if (href === "https://www.fsis.usda.gov/fsis/api/recall/v/1") {
      if (fsisStatus !== 200) return jsonResponse({ error: "FSIS unavailable" }, fsisStatus);
      return jsonResponse(fsis);
    }
    throw new Error(`Unexpected URL: ${href}`);
  };
}

test("FDA matching prioritizes supplied barcode, lot, and package date evidence", async () => {
  const { searchOfficialRecalls } = await loadRecallEngine();
  const response = await searchOfficialRecalls(
    {
      product: "blueberry muffin",
      brand: "Cafe Nouria",
      barcode: "811070033986",
      lot: "6082",
      date: "08/01/2026",
    },
    sourceFetch(),
    () => "2026-07-15T12:00:00.000Z",
  );

  assert.equal(response.results[0].agency, "FDA");
  assert.equal(response.results[0].matchLevel, "identifier");
  assert.deepEqual(response.results[0].matchDetails.slice(0, 3).map((detail) => detail.criterion), ["barcode", "lot", "date"]);
  assert.match(response.results[0].sourceUrl, /^https:\/\/api\.fda\.gov\/food\/enforcement\.json\?/);
  assert.equal(response.results[0].lastCheckedAt, "2026-07-15T12:00:00.000Z");
  assert.equal(response.sources.find((source) => source.agency === "FDA")?.dataUpdatedAt, "2026-07-12");
});

test("USDA-FSIS records expose affected products, reason, official URL, and identifier details", async () => {
  const { searchOfficialRecalls } = await loadRecallEngine();
  const response = await searchOfficialRecalls(
    {
      product: "ready-to-eat chicken",
      brand: "Acme Meats",
      category: "poultry",
      barcode: "012345678905",
      lot: "L2401",
      date: "09/15/2026",
    },
    sourceFetch({ fdaStatus: 404 }),
    () => "2026-07-15T12:05:00.000Z",
  );

  assert.equal(response.results.length, 1);
  const result = response.results[0];
  assert.equal(result.agency, "USDA-FSIS");
  assert.equal(result.matchLevel, "identifier");
  assert.match(result.affectedProducts, /UPC 012345678905/);
  assert.match(result.reason, /Possible contamination/);
  assert.equal(result.sourceUrl, fsisChickenRecall.field_recall_url);
  assert.equal(result.sourceUpdatedAt, "2026-07-11T14:15:00Z");
  assert.equal(response.sources.find((source) => source.agency === "USDA-FSIS")?.status, "available");
});

test("a conflicting barcode excludes a descriptive product-name result", async () => {
  const { searchOfficialRecalls } = await loadRecallEngine();
  const response = await searchOfficialRecalls(
    { product: "blueberry muffin", barcode: "999999999999" },
    sourceFetch({ fsis: [] }),
    () => "2026-07-15T12:10:00.000Z",
  );

  assert.equal(response.results.length, 0);
});

test("lot matching rejects substring-only code collisions", async () => {
  const { searchOfficialRecalls } = await loadRecallEngine();
  const response = await searchOfficialRecalls(
    { product: "blueberry muffin", lot: "6082" },
    sourceFetch({ fda: [{ ...fdaBlueberryRecall, code_info: "Lot: 16082" }], fsis: [] }),
    () => "2026-07-15T12:12:00.000Z",
  );

  assert.equal(response.results.length, 0);
});

test("descriptive matches state that wording does not establish package applicability", async () => {
  const { searchOfficialRecalls } = await loadRecallEngine();
  const response = await searchOfficialRecalls(
    { product: "blueberry muffin", brand: "Cafe Nouria" },
    sourceFetch({ fsis: [] }),
    () => "2026-07-15T12:15:00.000Z",
  );

  const result = response.results[0];
  assert.equal(result.matchLevel, "descriptive");
  assert.match(result.matchLabel, /to verify/i);
  assert.match(result.applicability, /does not establish that the package is affected/i);
  assert.doesNotMatch(result.applicability, /definitely|certainly|safe|unsafe|dangerous/i);
});

test("an unavailable FDA source does not hide matching USDA-FSIS records", async () => {
  const { searchOfficialRecalls } = await loadRecallEngine();
  const response = await searchOfficialRecalls(
    { product: "chicken bites", brand: "Acme Meats" },
    sourceFetch({ fdaStatus: 503 }),
    () => "2026-07-15T12:20:00.000Z",
  );

  assert.equal(response.results[0].agency, "USDA-FSIS");
  assert.equal(response.sources.find((source) => source.agency === "FDA")?.status, "unavailable");
  assert.match(response.warnings.join(" "), /FDA enforcement feed could not be reached/i);
});

test("both source failures remain explicit and timestamped", async () => {
  const { searchOfficialRecalls } = await loadRecallEngine();
  const response = await searchOfficialRecalls(
    { product: "chicken bites" },
    sourceFetch({ fdaStatus: 502, fsisStatus: 403 }),
    () => "2026-07-15T12:25:00.000Z",
  );

  assert.equal(response.results.length, 0);
  assert.equal(response.sources.every((source) => source.status === "unavailable"), true);
  assert.equal(response.sources.every((source) => source.checkedAt === response.checkedAt), true);
  assert.equal(response.warnings.length, 2);
});

test("search criteria are sanitized and a barcode can be used without a product name", async () => {
  const { hasRecallSearchCriteria, normalizeRecallCriteria } = await loadRecallEngine();
  const criteria = normalizeRecallCriteria({ product: "  Blueberry <script> muffin  ", barcode: "8110-7003-3986" });

  assert.equal(criteria.product, "Blueberry muffin");
  assert.equal(criteria.barcode, "811070033986");
  assert.equal(hasRecallSearchCriteria({ barcode: "8110-7003-3986" }), true);
  assert.equal(hasRecallSearchCriteria({ product: "x" }), false);
});

test("recall UI copy preserves no-clearance and official-source guardrails", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /A returned record is a lead to verify/);
  assert.match(page, /does not clear a product of recalls/);
  assert.match(page, /No available FDA or USDA-FSIS record matched/);
  assert.match(page, /This is not evidence that the product has no recall/);
  assert.match(page, /Official \{item\.agency\} source record/);
  assert.match(page, /Last checked/);
});
