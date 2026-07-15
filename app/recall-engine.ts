export type RecallAgency = "FDA" | "USDA-FSIS";

export type RecallSearchCriteria = {
  query?: string;
  brand?: string;
  product?: string;
  category?: string;
  barcode?: string;
  lot?: string;
  date?: string;
};

export type RecallMatchDetail = {
  criterion: "barcode" | "lot" | "date" | "brand" | "product" | "category";
  label: string;
  evidence: string;
};

export type RecallResult = {
  id: string;
  agency: RecallAgency;
  sourceName: string;
  sourceUrl: string;
  product: string;
  affectedProducts: string;
  reason: string;
  company: string;
  classification: string;
  status: string;
  date: string;
  distribution: string;
  codes: string;
  matchLevel: "identifier" | "descriptive" | "broad";
  matchLabel: string;
  applicability: string;
  matchDetails: RecallMatchDetail[];
  verificationGaps: string[];
  lastCheckedAt: string;
  sourceUpdatedAt?: string;
};

export type RecallSourceStatus = {
  agency: RecallAgency;
  name: string;
  url: string;
  status: "available" | "unavailable";
  checkedAt: string;
  dataUpdatedAt?: string;
  message?: string;
};

export type RecallSearchResponse = {
  criteria: Required<RecallSearchCriteria>;
  results: RecallResult[];
  checkedAt: string;
  sources: RecallSourceStatus[];
  warnings: string[];
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

type OpenFdaRecall = {
  recall_number?: unknown;
  event_id?: unknown;
  product_description?: unknown;
  reason_for_recall?: unknown;
  recalling_firm?: unknown;
  classification?: unknown;
  status?: unknown;
  report_date?: unknown;
  recall_initiation_date?: unknown;
  distribution_pattern?: unknown;
  code_info?: unknown;
  more_code_info?: unknown;
  product_quantity?: unknown;
  product_type?: unknown;
};

type FsisRecall = Record<string, unknown>;

type NormalizedRecall = Omit<RecallResult, "matchLevel" | "matchLabel" | "applicability" | "matchDetails" | "verificationGaps" | "lastCheckedAt"> & {
  categoryText: string;
};

const FDA_SOURCE = {
  agency: "FDA" as const,
  name: "FDA openFDA Food Enforcement Reports",
  url: "https://open.fda.gov/apis/food/enforcement/",
};

const FSIS_SOURCE = {
  agency: "USDA-FSIS" as const,
  name: "USDA-FSIS Recall and Public Health Alert API",
  url: "https://www.fsis.usda.gov/science-data/developer-resources/recall-api",
};

const STOP_WORDS = new Set([
  "and", "for", "from", "food", "foods", "the", "with", "without", "product", "products", "brand", "company", "inc", "llc",
]);

function text(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join("; ");
  return "";
}

function plainText(value: unknown) {
  return text(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function clean(value: unknown, max = 160) {
  return plainText(value)
    .replace(/[^a-zA-Z0-9 '&().,/:#_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compactIdentifier(value: string) {
  return value.toLowerCase().replace(/\b(?:lot|batch|code|upc|ean|gtin)\b/g, "").replace(/[^a-z0-9]/g, "");
}

function tokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function distinctiveToken(value: string) {
  return [...tokens(value)].sort((left, right) => right.length - left.length)[0] || "";
}

function overlapScore(needle: string, haystack: string) {
  const normalizedNeedle = normalize(needle);
  const normalizedHaystack = normalize(haystack);
  if (!normalizedNeedle || !normalizedHaystack) return 0;
  if (normalizedHaystack.includes(normalizedNeedle)) return 1;
  const wanted = [...new Set(tokens(normalizedNeedle))];
  if (!wanted.length) return 0;
  const available = new Set(tokens(normalizedHaystack));
  return wanted.filter((token) => available.has(token)).length / wanted.length;
}

function barcodeVariants(value: string) {
  const digits = value.replace(/\D/g, "");
  const variants = new Set<string>();
  if (digits.length >= 8) variants.add(digits);
  if (digits.length === 13 && digits.startsWith("0")) variants.add(digits.slice(1));
  if (digits.length === 12) variants.add(`0${digits}`);
  return variants;
}

function recordBarcodes(value: string) {
  const results = new Set<string>();
  for (const match of value.matchAll(/\b(?:upc|ean|gtin|bar\s*code)\s*(?:code|no|number)?\s*[:#"']?\s*(\d(?:[\s-]?\d){7,13})\b/gi)) {
    for (const variant of barcodeVariants(match[1])) results.add(variant);
  }
  return results;
}

function dateVariants(value: string) {
  const variants = new Set<string>();
  const normalized = normalize(value);
  const digits = value.replace(/\D/g, "");
  if (normalized) variants.add(normalized.replace(/\s/g, ""));
  if (digits.length === 8) {
    variants.add(digits);
    if (/^(19|20)\d{6}$/.test(digits)) variants.add(`${digits.slice(4)}${digits.slice(0, 4)}`);
    if (/^(0[1-9]|1[0-2])([0-2]\d|3[01])(19|20)\d{2}$/.test(digits)) variants.add(`${digits.slice(4)}${digits.slice(0, 4)}`);
  }
  return variants;
}

function includesIdentifier(haystack: string, input: string) {
  const compactInput = compactIdentifier(input);
  if (compactInput.length < 2) return false;
  const parts = (haystack.toLowerCase().match(/[a-z0-9]+/g) || []).filter((part) => !["lot", "batch", "code"].includes(part));
  return parts.some((_, index) => {
    let candidate = "";
    for (let width = 0; width < 3 && index + width < parts.length; width += 1) {
      candidate += parts[index + width];
      if (candidate === compactInput) return true;
      if (candidate.length >= compactInput.length) break;
    }
    return false;
  });
}

function safeFsisUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && (parsed.hostname === "fsis.usda.gov" || parsed.hostname.endsWith(".fsis.usda.gov"))
      ? parsed.toString()
      : "";
  } catch {
    return "";
  }
}

function fdaRecordUrl(recallNumber: string) {
  const params = new URLSearchParams({ search: `recall_number:"${recallNumber}"`, limit: "1" });
  return `https://api.fda.gov/food/enforcement.json?${params.toString()}`;
}

function normalizeFdaRecord(item: OpenFdaRecall, sourceUpdatedAt?: string): NormalizedRecall {
  const id = text(item.recall_number) || text(item.event_id) || `FDA-${text(item.report_date)}-${text(item.recalling_firm)}`;
  const product = plainText(item.product_description) || "Affected product description unavailable";
  const codes = [plainText(item.code_info), plainText(item.more_code_info)].filter(Boolean).join("; ") || "Code, lot, or date details not supplied in this record";
  return {
    id: `fda:${id}`,
    agency: "FDA",
    sourceName: FDA_SOURCE.name,
    sourceUrl: fdaRecordUrl(id),
    product,
    affectedProducts: product,
    reason: plainText(item.reason_for_recall) || "Recall reason unavailable in this record",
    company: plainText(item.recalling_firm) || "Recalling firm unavailable",
    classification: plainText(item.classification) || "Not classified",
    status: plainText(item.status) || "Status unavailable",
    date: text(item.recall_initiation_date) || text(item.report_date),
    distribution: plainText(item.distribution_pattern) || "Distribution details unavailable",
    codes,
    categoryText: [text(item.product_type), product].filter(Boolean).join(" "),
    sourceUpdatedAt,
  };
}

function normalizeFsisRecord(item: FsisRecall): NormalizedRecall {
  const id = text(item.field_recall_number) || text(item.field_year) || text(item.field_title) || "unidentified";
  const title = plainText(item.field_title);
  const affectedProducts = plainText(item.field_product_items) || plainText(item.field_labels) || plainText(item.field_summary) || title || "Affected product details unavailable";
  const establishment = plainText(item.field_establishment);
  const company = establishment || title || "Recalling establishment unavailable";
  const codes = [plainText(item.field_product_items), plainText(item.field_labels), establishment].filter(Boolean).join("; ") || "Code, lot, or date details not supplied in this record";
  return {
    id: `fsis:${id}`,
    agency: "USDA-FSIS",
    sourceName: FSIS_SOURCE.name,
    sourceUrl: safeFsisUrl(text(item.field_recall_url)) || "https://www.fsis.usda.gov/recalls-alerts",
    product: title || affectedProducts,
    affectedProducts,
    reason: plainText(item.field_recall_reason) || plainText(item.field_summary) || "Recall reason unavailable in this record",
    company,
    classification: plainText(item.field_recall_classification) || plainText(item.field_risk_level) || "Not classified",
    status: plainText(item.field_recall_type) || (text(item.field_active_notice).toLowerCase() === "true" ? "Active recall" : "Status unavailable"),
    date: text(item.field_recall_date),
    distribution: plainText(item.field_states) || plainText(item.field_distro_list) || "Distribution details unavailable",
    codes,
    categoryText: [plainText(item.field_processing), title, affectedProducts].filter(Boolean).join(" "),
    sourceUpdatedAt: text(item.field_last_modified_date) || undefined,
  };
}

export function normalizeRecallCriteria(criteria: RecallSearchCriteria): Required<RecallSearchCriteria> {
  return {
    query: clean(criteria.query),
    brand: clean(criteria.brand),
    product: clean(criteria.product),
    category: clean(criteria.category),
    barcode: String(criteria.barcode || "").replace(/\D/g, "").slice(0, 18),
    lot: clean(criteria.lot, 80),
    date: clean(criteria.date, 80),
  };
}

export function hasRecallSearchCriteria(criteria: RecallSearchCriteria) {
  const cleaned = normalizeRecallCriteria(criteria);
  return Boolean(
    cleaned.barcode.length >= 8 ||
      cleaned.lot.length >= 2 ||
      cleaned.date.length >= 4 ||
      cleaned.query.length >= 2 ||
      cleaned.brand.length >= 2 ||
      cleaned.product.length >= 2 ||
      cleaned.category.length >= 2,
  );
}

function matchRecall(record: NormalizedRecall, criteria: Required<RecallSearchCriteria>, checkedAt: string): RecallResult | null {
  const productInput = criteria.product || criteria.query;
  const productText = `${record.product} ${record.affectedProducts}`;
  const brandText = `${record.company} ${record.product}`;
  const identifierText = `${record.codes} ${record.affectedProducts} ${record.product}`;
  const categoryText = `${record.categoryText} ${productText}`;
  const matchDetails: RecallMatchDetail[] = [];
  const verificationGaps: string[] = [];
  let score = 0;
  let identifierMatches = 0;

  if (criteria.barcode) {
    const wanted = barcodeVariants(criteria.barcode);
    const available = recordBarcodes(identifierText);
    const matched = [...wanted].some((value) => available.has(value));
    if (matched) {
      identifierMatches += 1;
      score += 100;
      matchDetails.push({ criterion: "barcode", label: "Barcode/UPC matched", evidence: `${criteria.barcode} appears in the official affected-product details.` });
    } else if (available.size) {
      return null;
    } else {
      verificationGaps.push("The official record does not provide a machine-readable barcode for comparison.");
    }
  }

  if (criteria.lot) {
    const hasLotInformation = /\b(?:lot|batch|code)\b/i.test(identifierText);
    if (includesIdentifier(identifierText, criteria.lot)) {
      identifierMatches += 1;
      score += 80;
      matchDetails.push({ criterion: "lot", label: "Lot/code matched", evidence: `${criteria.lot} appears in the official code information.` });
    } else if (hasLotInformation) {
      return null;
    } else {
      verificationGaps.push("The official record does not provide comparable lot or code information.");
    }
  }

  if (criteria.date) {
    const recordDateText = compactIdentifier(identifierText);
    const matched = [...dateVariants(criteria.date)].some((value) => value.length >= 4 && recordDateText.includes(value));
    const hasPackageDates = /\b(?:best|use|sell|freeze|exp|date)\b/i.test(identifierText);
    if (matched) {
      identifierMatches += 1;
      score += 70;
      matchDetails.push({ criterion: "date", label: "Package date matched", evidence: `${criteria.date} appears in the official affected-product or code details.` });
    } else if (hasPackageDates) {
      return null;
    } else {
      verificationGaps.push("The official record does not provide a comparable package date.");
    }
  }

  const brandScore = overlapScore(criteria.brand, brandText);
  if (criteria.brand && brandScore >= 0.6) {
    score += Math.round(35 * brandScore);
    matchDetails.push({ criterion: "brand", label: brandScore === 1 ? "Brand/company wording matched" : "Brand/company wording overlaps", evidence: record.company });
  }

  const productScore = overlapScore(productInput, productText);
  if (productInput && productScore >= 0.5) {
    score += Math.round(45 * productScore);
    matchDetails.push({ criterion: "product", label: productScore === 1 ? "Product wording matched" : "Product wording overlaps", evidence: record.product });
  }

  const categoryScore = overlapScore(criteria.category, categoryText);
  if (criteria.category && categoryScore >= 0.5) {
    score += Math.round(15 * categoryScore);
    matchDetails.push({ criterion: "category", label: categoryScore === 1 ? "Category wording matched" : "Category wording overlaps", evidence: criteria.category });
  }

  if (!matchDetails.length) return null;

  let matchLevel: RecallResult["matchLevel"] = "broad";
  if (identifierMatches > 0) matchLevel = "identifier";
  else if ((brandScore >= 0.6 && productScore >= 0.5) || productScore >= 0.8 || brandScore === 1) matchLevel = "descriptive";

  const applicability =
    matchLevel === "identifier"
      ? "One or more supplied package identifiers appear in this official record. Compare every listed lot, date, size, and establishment detail before deciding whether the notice covers the package."
      : matchLevel === "descriptive"
        ? "The brand or product wording overlaps this official record. Wording alone does not establish that the package is affected; compare its UPC, lot, date, size, and establishment details."
        : "A broad product or category term overlaps this official record. Treat this as a lead for checking the official notice, not as confirmation that the package is affected.";

  return {
    ...record,
    matchLevel,
    matchLabel: matchLevel === "identifier" ? "Identifier match to verify" : matchLevel === "descriptive" ? "Descriptive match to verify" : "Broad possible match",
    applicability,
    matchDetails,
    verificationGaps,
    lastCheckedAt: checkedAt,
    _score: score,
  } as RecallResult & { _score: number };
}

function fdaQueries(criteria: Required<RecallSearchCriteria>) {
  const queries: Array<[keyof OpenFdaRecall, string]> = [];
  if (criteria.barcode) queries.push(["product_description", criteria.barcode], ["code_info", criteria.barcode]);
  if (criteria.lot) {
    const lot = distinctiveToken(criteria.lot) || criteria.lot;
    queries.push(["code_info", lot], ["more_code_info", lot]);
  }
  if (criteria.brand) queries.push(["recalling_firm", criteria.brand]);
  const product = criteria.product || criteria.query;
  const productToken = distinctiveToken(product);
  if (productToken) queries.push(["product_description", productToken]);
  const categoryToken = distinctiveToken(criteria.category);
  if (categoryToken) queries.push(["product_description", categoryToken]);
  if (!queries.length && criteria.date) {
    const year = criteria.date.match(/\b(?:19|20)\d{2}\b/)?.[0];
    if (year) queries.push(["code_info", year]);
  }
  return [...new Map(queries.map(([field, value]) => [`${field}:${value.toLowerCase()}`, [field, value] as const])).values()].slice(0, 6);
}

function fdaEndpoint(field: keyof OpenFdaRecall, value: string) {
  const escaped = value.replace(/["\\]/g, " ").trim();
  const params = new URLSearchParams({
    search: `${field}:"${escaped}"`,
    sort: "report_date:desc",
    limit: "50",
  });
  return `https://api.fda.gov/food/enforcement.json?${params.toString()}`;
}

async function fetchFda(criteria: Required<RecallSearchCriteria>, fetchImpl: FetchLike, checkedAt: string) {
  const queries = fdaQueries(criteria);
  const responses = await Promise.all(
    queries.map(async ([field, value]) => {
      try {
        const response = await fetchImpl(fdaEndpoint(field, value), {
          headers: { Accept: "application/json", "User-Agent": "FoodMonocle/0.4 (official recall lookup)" },
          signal: AbortSignal.timeout(8000),
        });
        if (response.status === 404) return { ok: true, results: [] as OpenFdaRecall[] };
        if (!response.ok) return { ok: false, results: [] as OpenFdaRecall[] };
        const data = (await response.json()) as { meta?: { last_updated?: unknown }; results?: OpenFdaRecall[] };
        return { ok: true, results: Array.isArray(data.results) ? data.results : [], updatedAt: text(data.meta?.last_updated) || undefined };
      } catch {
        return { ok: false, results: [] as OpenFdaRecall[] };
      }
    }),
  );
  const available = responses.some((response) => response.ok);
  const dataUpdatedAt = responses.map((response) => response.updatedAt).find(Boolean);
  const unique = new Map<string, OpenFdaRecall>();
  for (const response of responses) {
    for (const record of response.results) {
      const id = text(record.recall_number) || `${text(record.event_id)}:${text(record.product_description)}`;
      unique.set(id, record);
    }
  }
  return {
    records: [...unique.values()].map((record) => normalizeFdaRecord(record, dataUpdatedAt)),
    status: {
      ...FDA_SOURCE,
      status: available ? ("available" as const) : ("unavailable" as const),
      checkedAt,
      dataUpdatedAt,
      message: available ? undefined : "The FDA enforcement feed could not be reached for this search.",
    },
  };
}

async function fetchFsis(fetchImpl: FetchLike, checkedAt: string) {
  try {
    const response = await fetchImpl("https://www.fsis.usda.gov/fsis/api/recall/v/1", {
      headers: { Accept: "application/json", "User-Agent": "FoodMonocle/0.4 (official recall lookup)" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`FSIS returned ${response.status}`);
    const data = (await response.json()) as unknown;
    const items = Array.isArray(data)
      ? data
      : data && typeof data === "object" && Array.isArray((data as { results?: unknown }).results)
        ? ((data as { results: unknown[] }).results)
        : [];
    return {
      records: items.filter((item): item is FsisRecall => Boolean(item && typeof item === "object")).map(normalizeFsisRecord),
      status: { ...FSIS_SOURCE, status: "available" as const, checkedAt },
    };
  } catch {
    return {
      records: [] as NormalizedRecall[],
      status: {
        ...FSIS_SOURCE,
        status: "unavailable" as const,
        checkedAt,
        message: "The USDA-FSIS recall feed could not be reached for this search.",
      },
    };
  }
}

export async function searchOfficialRecalls(
  input: RecallSearchCriteria,
  fetchImpl: FetchLike = fetch,
  now: () => string = () => new Date().toISOString(),
): Promise<RecallSearchResponse> {
  const criteria = normalizeRecallCriteria(input);
  const checkedAt = now();
  const [fda, fsis] = await Promise.all([fetchFda(criteria, fetchImpl, checkedAt), fetchFsis(fetchImpl, checkedAt)]);
  const sources = [fda.status, fsis.status];
  const results = [...fda.records, ...fsis.records]
    .map((record) => matchRecall(record, criteria, checkedAt))
    .filter((result): result is RecallResult & { _score?: number } => Boolean(result))
    .sort((left, right) => (right._score || 0) - (left._score || 0) || right.date.localeCompare(left.date))
    .slice(0, 12)
    .map(({ _score: _ignored, ...result }) => result);
  const warnings = sources
    .filter((source) => source.status === "unavailable")
    .map((source) => ("message" in source && source.message ? source.message : `${source.name} is unavailable.`));
  return { criteria, results, checkedAt, sources, warnings };
}
