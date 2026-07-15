export type OpenFoodFactsNutrition = {
  energyKcal100g?: number;
  fat100g?: number;
  carbohydrates100g?: number;
  sugars100g?: number;
  proteins100g?: number;
  salt100g?: number;
};

export type OpenFoodFactsProduct = {
  barcode: string;
  name: string;
  brand: string;
  ingredientsText: string;
  categories: string[];
  labels: string[];
  disclosureText: string;
  nutrition: OpenFoodFactsNutrition;
};

export type OpenFoodFactsSource = {
  name: "Open Food Facts";
  description: string;
  url: string;
  retrievedAt: string;
};

export type OpenFoodFactsLookupResult =
  | {
      status: "found" | "incomplete";
      barcode: string;
      product: OpenFoodFactsProduct;
      source: OpenFoodFactsSource;
      analysisText: string;
      warnings: string[];
      fallbackPrompt: string;
      fallbackSourceLabel: string;
    }
  | {
      status: "not-found" | "error";
      barcode: string;
      source: OpenFoodFactsSource;
      message: string;
      fallbackPrompt: string;
      fallbackSourceLabel: string;
    };

type FetchLike = (input: string | URL, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<Response>;

type OpenFoodFactsApiProduct = {
  product_name?: unknown;
  product_name_en?: unknown;
  brands?: unknown;
  ingredients_text?: unknown;
  ingredients_text_en?: unknown;
  labels?: unknown;
  labels_tags?: unknown;
  categories?: unknown;
  categories_tags?: unknown;
  allergens?: unknown;
  allergens_tags?: unknown;
  traces?: unknown;
  traces_tags?: unknown;
  nutriments?: unknown;
};

type OpenFoodFactsApiResponse = {
  status?: unknown;
  product?: OpenFoodFactsApiProduct;
};

export const OPEN_FOOD_FACTS_FIELDS = [
  "product_name",
  "product_name_en",
  "brands",
  "ingredients_text",
  "ingredients_text_en",
  "labels",
  "labels_tags",
  "categories",
  "categories_tags",
  "allergens",
  "allergens_tags",
  "traces",
  "traces_tags",
  "nutriments",
].join(",");

const sourceDescription =
  "Open Food Facts is a third-party, community-maintained product database. Records may be incomplete or out of date.";

export function normalizeBarcode(value: string) {
  return value.replace(/\D/g, "").slice(0, 18);
}

export function openFoodFactsProductUrl(barcode: string) {
  return `https://world.openfoodfacts.org/product/${encodeURIComponent(barcode)}`;
}

function sourceFor(barcode: string, retrievedAt: string): OpenFoodFactsSource {
  return {
    name: "Open Food Facts",
    description: sourceDescription,
    url: openFoodFactsProductUrl(barcode),
    retrievedAt,
  };
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function titleFromTag(value: string) {
  return value
    .replace(/^[a-z]{2}:/i, "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stringList(primary: unknown, tags: unknown) {
  const values = new Set<string>();
  if (typeof primary === "string") {
    primary
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((value) => values.add(value));
  }
  if (values.size) return [...values];
  if (Array.isArray(tags)) {
    tags.map((value) => (typeof value === "string" ? titleFromTag(value) : "")).filter(Boolean).forEach((value) => values.add(value));
  }
  return [...values];
}

function numberFromNutriments(nutriments: Record<string, unknown>, key: string) {
  const value = nutriments[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nutritionFrom(product: OpenFoodFactsApiProduct): OpenFoodFactsNutrition {
  const nutriments = product.nutriments && typeof product.nutriments === "object" ? (product.nutriments as Record<string, unknown>) : {};
  return {
    energyKcal100g: numberFromNutriments(nutriments, "energy-kcal_100g"),
    fat100g: numberFromNutriments(nutriments, "fat_100g"),
    carbohydrates100g: numberFromNutriments(nutriments, "carbohydrates_100g"),
    sugars100g: numberFromNutriments(nutriments, "sugars_100g"),
    proteins100g: numberFromNutriments(nutriments, "proteins_100g"),
    salt100g: numberFromNutriments(nutriments, "salt_100g"),
  };
}

function hasNutrition(nutrition: OpenFoodFactsNutrition) {
  return Object.values(nutrition).some((value) => typeof value === "number");
}

function buildAnalysisText(product: OpenFoodFactsProduct) {
  return [
    product.name ? `Product: ${product.name}` : "",
    product.brand ? `Brand: ${product.brand}` : "",
    product.ingredientsText ? `Ingredients: ${product.ingredientsText}` : "",
    product.labels.length ? `Labels and available disclosure text: ${product.labels.join(", ")}` : "",
    product.disclosureText ? `Other package disclosures in Open Food Facts: ${product.disclosureText}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function mapOpenFoodFactsResponse(data: OpenFoodFactsApiResponse, barcode: string, retrievedAt: string): OpenFoodFactsLookupResult {
  const source = sourceFor(barcode, retrievedAt);
  if (data.status !== 1 || !data.product) {
    return {
      status: "not-found",
      barcode,
      source,
      message: "That barcode was not in Open Food Facts. This does not say anything about ingredients or disclosures on the package.",
      fallbackPrompt: "Use photo OCR or manual label entry to analyze the physical package evidence.",
      fallbackSourceLabel: "Manual label text after Open Food Facts no-match",
    };
  }

  const productData = data.product;
  const labels = stringList(productData.labels, productData.labels_tags);
  const categories = stringList(productData.categories, productData.categories_tags);
  const allergenText = stringList(productData.allergens, productData.allergens_tags);
  const tracesText = stringList(productData.traces, productData.traces_tags);
  const nutrition = nutritionFrom(productData);
  const product: OpenFoodFactsProduct = {
    barcode,
    name: asText(productData.product_name) || asText(productData.product_name_en) || "Unnamed Open Food Facts product",
    brand: asText(productData.brands),
    ingredientsText: asText(productData.ingredients_text) || asText(productData.ingredients_text_en),
    categories,
    labels,
    disclosureText: [...allergenText.map((item) => `Allergen: ${item}`), ...tracesText.map((item) => `Trace: ${item}`)].join("; "),
    nutrition,
  };
  const warnings = [
    product.ingredientsText ? "" : "Ingredients are missing from the Open Food Facts record.",
    hasNutrition(nutrition) ? "" : "Nutrition data is missing from the Open Food Facts record.",
    labels.length || product.disclosureText ? "" : "Labels and disclosure fields are missing from the Open Food Facts record.",
  ].filter(Boolean);

  return {
    status: warnings.length ? "incomplete" : "found",
    barcode,
    product,
    source,
    analysisText: buildAnalysisText(product),
    warnings,
    fallbackPrompt: warnings.length
      ? "Scan the ingredient panel or paste the package text to fill gaps before relying on this report."
      : "Compare the database record with the physical package before relying on it.",
    fallbackSourceLabel: warnings.length
      ? "Manual label text after incomplete Open Food Facts record"
      : "Open Food Facts barcode record reviewed against package",
  };
}

export async function lookupOpenFoodFactsBarcode(
  value: string,
  fetchImpl: FetchLike = fetch,
  now: () => string = () => new Date().toISOString(),
): Promise<OpenFoodFactsLookupResult> {
  const barcode = normalizeBarcode(value);
  const retrievedAt = now();
  const source = sourceFor(barcode, retrievedAt);
  const endpoint = new URL(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}`);
  endpoint.searchParams.set("fields", OPEN_FOOD_FACTS_FIELDS);

  try {
    const response = await fetchImpl(endpoint.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "FoodMonocle/0.2 (https://github.com/Wizman69/Foodmonocle)",
      },
    });
    if (!response.ok) {
      throw new Error(`Open Food Facts returned ${response.status}`);
    }
    const data = (await response.json()) as OpenFoodFactsApiResponse;
    return mapOpenFoodFactsResponse(data, barcode, retrievedAt);
  } catch {
    return {
      status: "error",
      barcode,
      source,
      message: "Open Food Facts could not be reached. The barcode database lookup did not complete.",
      fallbackPrompt: "Use photo OCR or manual label entry while the barcode source is unavailable.",
      fallbackSourceLabel: "Manual label text after Open Food Facts lookup error",
    };
  }
}
