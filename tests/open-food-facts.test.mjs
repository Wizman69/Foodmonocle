import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const moduleUrl = new URL("../app/open-food-facts.ts", import.meta.url);

async function loadOpenFoodFacts() {
  return import(moduleUrl.href);
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

test("every user-facing demo barcode validates and prepares the production lookup path", async () => {
  const [{ normalizeGtin, prepareBarcodeLookup }, { DEMO_BARCODE, USER_FACING_DEMO_BARCODES }, page] = await Promise.all([
    import(new URL("../app/barcode.ts", import.meta.url).href),
    import(new URL("../app/food-intelligence.ts", import.meta.url).href),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.deepEqual(USER_FACING_DEMO_BARCODES, [DEMO_BARCODE]);
  for (const barcode of USER_FACING_DEMO_BARCODES) {
    assert.equal(normalizeGtin(barcode), barcode);
    assert.deepEqual(prepareBarcodeLookup(barcode), {
      barcode,
      path: `/api/barcode?barcode=${encodeURIComponent(barcode)}`,
    });
  }
  assert.match(page, /setBarcode\(DEMO_BARCODE\)/);
  assert.match(page, /setScanStage\("Checking Open Food Facts"\)/);
  assert.match(page, /fetchWithTimeout\(preparedBarcode\.path/);
});

test("successful barcode lookup maps Open Food Facts product data for evidence analysis", async () => {
  const { lookupOpenFoodFactsBarcode } = await loadOpenFoodFacts();
  const fetches = [];
  const result = await lookupOpenFoodFactsBarcode(
    " 3017620422003 ",
    async (url, init) => {
      fetches.push({ url: url.toString(), userAgent: init?.headers?.["User-Agent"] });
      return jsonResponse({
        status: 1,
        product: {
          product_name: "Colorful corn snack",
          brands: "Acme Foods",
          ingredients_text: "Corn meal, canola oil, yellow 5. Contains bioengineered food ingredients.",
          categories: "Snacks, Corn snacks",
          labels: "Gluten-free, Bioengineered food ingredients",
          labels_tags: ["en:gluten-free", "en:bioengineered-food-ingredients"],
          nutriments: {
            "energy-kcal_100g": 510,
            fat_100g: 27,
            carbohydrates_100g: 62,
            proteins_100g: 6,
            salt_100g: 1.2,
            sugars_100g: 3,
          },
        },
      });
    },
    () => "2026-07-14T21:30:00.000Z",
  );

  assert.equal(result.status, "found");
  assert.equal(result.product.name, "Colorful corn snack");
  assert.equal(result.product.brand, "Acme Foods");
  assert.match(result.analysisText, /Contains bioengineered food ingredients/);
  assert.deepEqual(result.product.labels, ["Gluten-free", "Bioengineered food ingredients"]);
  assert.deepEqual(result.product.categories, ["Snacks", "Corn snacks"]);
  assert.equal(result.product.nutrition.energyKcal100g, 510);
  assert.equal(result.source.name, "Open Food Facts");
  assert.equal(result.source.retrievedAt, "2026-07-14T21:30:00.000Z");
  assert.equal(result.source.url, "https://world.openfoodfacts.org/product/3017620422003");
  assert.equal(fetches[0].url.includes("fields="), true);
  assert.match(fetches[0].userAgent, /FoodMonocle/);
});

test("product not found returns OCR and manual fallback guidance without absence claims", async () => {
  const { lookupOpenFoodFactsBarcode } = await loadOpenFoodFacts();
  const result = await lookupOpenFoodFactsBarcode(
    "0000000000000",
    async () => jsonResponse({ status: 0, status_verbose: "product not found" }),
    () => "2026-07-14T21:31:00.000Z",
  );

  assert.equal(result.status, "not-found");
  assert.match(result.message, /not in Open Food Facts/i);
  assert.match(result.fallbackPrompt, /photo OCR or manual label entry/i);
  assert.doesNotMatch(result.message, /absent|not present|recall-free|safe/i);
  assert.equal(result.source.retrievedAt, "2026-07-14T21:31:00.000Z");
});

test("incomplete product information keeps partial fields and requests label fallback", async () => {
  const { lookupOpenFoodFactsBarcode } = await loadOpenFoodFacts();
  const { analyzeText } = await import(new URL("../app/food-intelligence.ts", import.meta.url).href);
  const result = await lookupOpenFoodFactsBarcode(
    "96385074",
    async () =>
      jsonResponse({
        status: 1,
        product: {
          product_name: "Mystery crackers",
          brands: "Small Brand",
          labels_tags: ["en:organic"],
          nutriments: { salt_100g: 0.8 },
        },
      }),
    () => "2026-07-14T21:32:00.000Z",
  );

  assert.equal(result.status, "incomplete");
  assert.equal(result.product.name, "Mystery crackers");
  assert.equal(result.product.brand, "Small Brand");
  assert.deepEqual(result.product.labels, ["Organic"]);
  assert.equal(result.product.ingredientsText, "");
  assert.match(result.warnings.join(" "), /ingredients/i);
  assert.match(result.fallbackPrompt, /scan the ingredient panel/i);
  assert.equal(result.analysisText.includes("Organic"), true);

  const report = analyzeText(result.analysisText, "barcode", { limitedEvidence: true });
  assert.equal(report.bioengineered, "unclear");
  assert.equal(report.cultivated, "unclear");
  assert.doesNotMatch(report.summary, /No bioengineered-food disclosure was found/i);
  assert.match(report.summary, /Not enough supplied evidence/i);
});

test("network or API failure returns clear error and fallback guidance", async () => {
  const { lookupOpenFoodFactsBarcode } = await loadOpenFoodFacts();
  const result = await lookupOpenFoodFactsBarcode(
    "3017620422003",
    async () => {
      throw new Error("socket closed");
    },
    () => "2026-07-14T21:33:00.000Z",
  );

  assert.equal(result.status, "error");
  assert.match(result.message, /could not be reached/i);
  assert.match(result.fallbackPrompt, /manual label entry/i);
  assert.equal(result.source.name, "Open Food Facts");
});

test("manual fallback text can still feed existing evidence analysis", async () => {
  const { lookupOpenFoodFactsBarcode } = await loadOpenFoodFacts();
  const { analyzeText } = await import(new URL("../app/food-intelligence.ts", import.meta.url).href);
  const lookup = await lookupOpenFoodFactsBarcode(
    "0000000000000",
    async () => jsonResponse({ status: 0 }),
    () => "2026-07-14T21:34:00.000Z",
  );

  const report = analyzeText(
    "Ingredients: corn, salt. Contains bioengineered food ingredients.",
    "ingredients",
    { sourceLabel: lookup.fallbackSourceLabel },
  );

  assert.equal(report.bioengineered, "found");
  assert.equal(report.sourceLabel, "Manual label text after Open Food Facts no-match");
});

test("source attribution and retrieval date are always present for barcode outcomes", async () => {
  const { lookupOpenFoodFactsBarcode } = await loadOpenFoodFacts();
  const results = await Promise.all([
    lookupOpenFoodFactsBarcode("1", async () => jsonResponse({ status: 0 }), () => "2026-07-14T21:35:00.000Z"),
    lookupOpenFoodFactsBarcode("2", async () => new Response("bad gateway", { status: 502 }), () => "2026-07-14T21:36:00.000Z"),
  ]);

  for (const result of results) {
    assert.equal(result.source.name, "Open Food Facts");
    assert.match(result.source.description, /third-party, community-maintained/i);
    assert.match(result.source.url, /^https:\/\/world\.openfoodfacts\.org\/product\//);
    assert.match(result.source.retrievedAt, /^2026-07-14T21:3/);
  }
});
