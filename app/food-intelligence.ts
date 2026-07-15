export type ScanMode = "photo" | "barcode" | "ingredients" | "qr";
export type FindingState = "found" | "not-found" | "unclear";

export type AdditiveFinding = {
  name: string;
  aliases: string[];
  purpose: string;
  note: string;
  family: string;
};

export type EvidenceFinding = {
  id: string;
  category: string;
  state: FindingState;
  headline: string;
  evidence: string;
  source: string;
  confidence: "High" | "Moderate" | "Low";
  sourceUrl?: string;
  sourceLastReviewed?: string;
};

export type ScanReport = {
  id: string;
  productName: string;
  createdAt: string;
  input: string;
  source: ScanMode;
  sourceLabel: string;
  clarityScore: number;
  confidence: "High" | "Moderate" | "Low";
  bioengineered: FindingState;
  cultivated: FindingState;
  digitalDisclosure: FindingState;
  qrUrl?: string;
  barcode?: string;
  processingMarkers: string[];
  processingLevel: 0 | 1 | 2 | 3 | 4;
  processingLabel: string;
  additives: AdditiveFinding[];
  allergens: string[];
  labelClaims: string[];
  evidence: EvidenceFinding[];
  summary: string;
  productInfo?: Record<string, unknown>;
};

export const SAMPLE_LABEL =
  "Ingredients: corn meal, canola oil, maltodextrin, natural flavors, modified food starch, yellow 5, red 40, salt. Contains bioengineered food ingredients. Contains: wheat.";

export const SECOND_SAMPLE_LABEL =
  "Ingredients: whole grain corn, sunflower oil, sea salt. Certified organic. Contains no artificial colors or flavors.";

export const CULTIVATED_SAMPLE_LABEL =
  "Ingredients: cell-cultivated chicken, water, sunflower oil, pea protein, salt, natural flavor. Contains: pea. This product contains cultivated chicken made from cultured animal cells.";

export const DEMO_BARCODE = "3017620422003";
export const USER_FACING_DEMO_BARCODES = [DEMO_BARCODE] as const;

export const SOURCE_REFERENCES = {
  bioengineered: {
    label: "USDA Bioengineered Food Disclosure Standard",
    url: "https://www.ams.usda.gov/rules-regulations/be",
    lastReviewed: "2026-07-14",
  },
  cultivated: {
    label: "FDA human food made with cultured animal cells",
    url: "https://www.fda.gov/food/food-ingredients-packaging/human-food-made-cultured-animal-cells",
    lastReviewed: "2026-07-14",
  },
  digital: {
    label: "USDA bioengineered disclosure FAQ",
    url: "https://www.ams.usda.gov/rules-regulations/be/faq/disclosure",
    lastReviewed: "2026-07-14",
  },
  recalls: {
    label: "openFDA Food Enforcement Reports",
    url: "https://open.fda.gov/apis/food/enforcement/",
    lastReviewed: "2026-07-15",
  },
  recallsFsis: {
    label: "USDA-FSIS Recall and Public Health Alert API",
    url: "https://www.fsis.usda.gov/science-data/developer-resources/recall-api",
    lastReviewed: "2026-07-15",
  },
} as const;

export const ADDITIVE_DICTIONARY: AdditiveFinding[] = [
  {
    name: "Red 40",
    aliases: ["red 40", "allura red", "fd&c red no. 40"],
    purpose: "Synthetic color",
    family: "Color",
    note: "Adds red color. It must be named on U.S. ingredient labels.",
  },
  {
    name: "Yellow 5",
    aliases: ["yellow 5", "tartrazine", "fd&c yellow no. 5"],
    purpose: "Synthetic color",
    family: "Color",
    note: "Adds yellow color. U.S. labels identify it by name.",
  },
  {
    name: "Yellow 6",
    aliases: ["yellow 6", "sunset yellow", "fd&c yellow no. 6"],
    purpose: "Synthetic color",
    family: "Color",
    note: "Adds orange-yellow color and is declared by name on U.S. labels.",
  },
  {
    name: "Blue 1",
    aliases: ["blue 1", "brilliant blue", "fd&c blue no. 1"],
    purpose: "Synthetic color",
    family: "Color",
    note: "Adds blue color and may be blended with other colors.",
  },
  {
    name: "Maltodextrin",
    aliases: ["maltodextrin"],
    purpose: "Texture and bulking",
    family: "Texture",
    note: "A starch-derived ingredient used to carry flavor, add body, or manage texture.",
  },
  {
    name: "Carrageenan",
    aliases: ["carrageenan"],
    purpose: "Thickener and stabilizer",
    family: "Texture",
    note: "A seaweed-derived ingredient used to thicken foods and keep mixtures uniform.",
  },
  {
    name: "Xanthan gum",
    aliases: ["xanthan gum"],
    purpose: "Thickener and stabilizer",
    family: "Texture",
    note: "Helps control thickness and keep ingredients from separating.",
  },
  {
    name: "Guar gum",
    aliases: ["guar gum"],
    purpose: "Thickener",
    family: "Texture",
    note: "A plant-derived gum used for body, moisture retention, and texture.",
  },
  {
    name: "Mono- and diglycerides",
    aliases: ["mono and diglycerides", "monoglycerides", "diglycerides"],
    purpose: "Emulsifier",
    family: "Emulsifier",
    note: "Helps oil and water stay mixed and supports a consistent texture.",
  },
  {
    name: "Polysorbate 80",
    aliases: ["polysorbate 80"],
    purpose: "Emulsifier",
    family: "Emulsifier",
    note: "Helps ingredients disperse evenly and can improve texture stability.",
  },
  {
    name: "Soy lecithin",
    aliases: ["soy lecithin", "lecithin"],
    purpose: "Emulsifier",
    family: "Emulsifier",
    note: "Helps fats and water mix. Soy-derived lecithin may also be relevant to label preferences.",
  },
  {
    name: "Potassium sorbate",
    aliases: ["potassium sorbate"],
    purpose: "Preservative",
    family: "Preservative",
    note: "Helps slow mold and yeast growth.",
  },
  {
    name: "Sodium benzoate",
    aliases: ["sodium benzoate"],
    purpose: "Preservative",
    family: "Preservative",
    note: "Helps control yeast, mold, and some bacteria in acidic foods and drinks.",
  },
  {
    name: "BHA or BHT",
    aliases: ["bht", "bha", "butylated hydroxyanisole", "butylated hydroxytoluene"],
    purpose: "Antioxidant preservative",
    family: "Preservative",
    note: "Helps fats resist oxidation and remain shelf-stable.",
  },
  {
    name: "Nitrite or nitrate",
    aliases: ["sodium nitrite", "sodium nitrate", "potassium nitrite", "potassium nitrate"],
    purpose: "Curing and preservation",
    family: "Preservative",
    note: "Common in cured meat for color, flavor, and microbial control.",
  },
  {
    name: "Citric acid",
    aliases: ["citric acid"],
    purpose: "Acidity control",
    family: "Acid",
    note: "Adds tartness or adjusts acidity; it can also support preservation.",
  },
  {
    name: "Ascorbic acid",
    aliases: ["ascorbic acid", "vitamin c"],
    purpose: "Antioxidant or vitamin",
    family: "Antioxidant",
    note: "Vitamin C used to protect color or flavor and sometimes to add nutritional value.",
  },
  {
    name: "MSG",
    aliases: ["monosodium glutamate", "msg"],
    purpose: "Flavor enhancer",
    family: "Flavor",
    note: "Adds savory taste and must be listed as monosodium glutamate when directly added in the U.S.",
  },
  {
    name: "Disodium inosinate or guanylate",
    aliases: ["disodium inosinate", "disodium guanylate"],
    purpose: "Flavor enhancer",
    family: "Flavor",
    note: "Often paired with other seasonings to strengthen savory flavor.",
  },
  {
    name: "Sucralose",
    aliases: ["sucralose"],
    purpose: "High-intensity sweetener",
    family: "Sweetener",
    note: "Provides sweetness in a small amount and contributes little energy at typical use levels.",
  },
  {
    name: "Aspartame",
    aliases: ["aspartame"],
    purpose: "High-intensity sweetener",
    family: "Sweetener",
    note: "Provides sweetness in a small amount. Products containing it carry a phenylalanine statement in the U.S.",
  },
];

const processingRules = [
  { terms: ["natural flavor", "artificial flavor"], label: "Added flavors" },
  { terms: ["modified food starch", "modified corn starch"], label: "Modified starch" },
  { terms: ["maltodextrin"], label: "Maltodextrin" },
  { terms: ["protein isolate", "soy protein concentrate", "pea protein isolate"], label: "Protein isolate" },
  { terms: ["high fructose corn syrup", "corn syrup solids"], label: "Refined sweetener" },
  { terms: ["red 40", "yellow 5", "blue 1", "yellow 6"], label: "Synthetic color" },
  { terms: ["carrageenan", "xanthan gum", "guar gum"], label: "Texture agent" },
  { terms: ["potassium sorbate", "sodium benzoate", "bht", "bha"], label: "Preservative" },
  { terms: ["mono and diglycerides", "polysorbate 80", "lecithin"], label: "Emulsifier" },
  { terms: ["sucralose", "aspartame", "acesulfame potassium"], label: "High-intensity sweetener" },
  { terms: ["disodium inosinate", "disodium guanylate", "monosodium glutamate"], label: "Flavor enhancer" },
];

const allergenRules = [
  { terms: ["milk", "whey", "casein"], label: "Milk" },
  { terms: ["wheat", "gluten"], label: "Wheat" },
  { terms: ["soy", "soybean"], label: "Soy" },
  { terms: ["egg", "albumin"], label: "Egg" },
  { terms: ["peanut"], label: "Peanut" },
  { terms: ["almond", "cashew", "walnut", "pecan", "pistachio", "hazelnut"], label: "Tree nuts" },
  { terms: ["salmon", "tuna", "cod", "fish"], label: "Fish" },
  { terms: ["shrimp", "crab", "lobster", "shellfish"], label: "Crustacean shellfish" },
  { terms: ["sesame", "tahini"], label: "Sesame" },
];

const claimRules = [
  { terms: ["non-gmo", "non gmo"], label: "Non-GMO claim" },
  { terms: ["organic"], label: "Organic claim" },
  { terms: ["natural"], label: "Natural claim" },
  { terms: ["no artificial"], label: "No artificial ingredients claim" },
];

const bioTerms = [
  "contains a bioengineered food ingredient",
  "contains bioengineered food ingredients",
  "bioengineered food ingredients",
  "bioengineered food",
  "derived from bioengineering",
  "may be bioengineered",
  "genetically engineered",
  "genetically modified",
];

const cultivatedTerms = [
  "cell-cultivated chicken",
  "cell-cultivated meat",
  "cell-cultured chicken",
  "cell-cultured meat",
  "cell cultivated",
  "cell cultured",
  "cultivated chicken",
  "cultivated meat",
  "cultured animal cells",
  "animal cell culture",
  "grown from animal cells",
];

const digitalTerms = [
  "scan here for more food information",
  "scan for more food information",
  "electronic or digital link disclosure",
  "visit for more food information",
  "call for more food information",
];

const includesAny = (text: string, terms: string[]) => terms.some((term) => text.includes(term));

function findSnippet(input: string, terms: string[]) {
  const clean = input.replace(/\s+/g, " ").trim();
  const lower = clean.toLowerCase();
  const match = terms
    .map((term) => ({ term, index: lower.indexOf(term) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index)[0];

  if (!match) return "";
  const start = Math.max(0, match.index - 45);
  const end = Math.min(clean.length, match.index + match.term.length + 65);
  return `${start > 0 ? "..." : ""}${clean.slice(start, end).trim()}${end < clean.length ? "..." : ""}`;
}

function sourceForMode(mode: ScanMode) {
  if (mode === "photo") return "On-device photo OCR";
  if (mode === "barcode") return "Barcode product record";
  if (mode === "qr") return "QR or digital disclosure";
  return "Supplied package text";
}

function confidenceFor(mode: ScanMode, textLength: number): "High" | "Moderate" | "Low" {
  if (mode === "photo") return textLength > 70 ? "Moderate" : "Low";
  if (mode === "qr" && textLength < 40) return "Low";
  return textLength > 110 ? "High" : textLength > 45 ? "Moderate" : "Low";
}

function processingLevelFor(markerCount: number): 0 | 1 | 2 | 3 | 4 {
  if (markerCount >= 8) return 4;
  if (markerCount >= 5) return 3;
  if (markerCount >= 3) return 2;
  if (markerCount >= 1) return 1;
  return 0;
}

const processingLabels = [
  "No supported markers",
  "A few formulation markers",
  "Several formulation markers",
  "Many formulation markers",
  "Extensive formulation markers",
] as const;

type AnalyzeOptions = {
  productName?: string;
  sourceLabel?: string;
  qrUrl?: string;
  barcode?: string;
  limitedEvidence?: boolean;
  productInfo?: Record<string, unknown>;
};

export function analyzeText(input: string, source: ScanMode, options: AnalyzeOptions = {}): ScanReport {
  const text = input.toLowerCase().replace(/\s+/g, " ").trim();
  const qrDestinationOnly = source === "qr" && /^https?:\/\/\S+$/.test(text);
  const canCallNoMatch = text.length > 30 && !options.limitedEvidence;
  const bioengineered: FindingState = includesAny(text, bioTerms)
    ? "found"
    : qrDestinationOnly
      ? "unclear"
    : canCallNoMatch
      ? "not-found"
      : "unclear";
  const cultivated: FindingState = includesAny(text, cultivatedTerms)
    ? "found"
    : qrDestinationOnly
      ? "unclear"
    : canCallNoMatch
      ? "not-found"
      : "unclear";
  const digitalDisclosure: FindingState = options.qrUrl || includesAny(text, digitalTerms)
    ? "found"
    : source === "qr"
      ? "unclear"
      : canCallNoMatch
        ? "not-found"
        : "unclear";

  const additives = ADDITIVE_DICTIONARY.filter((item) => includesAny(text, item.aliases));
  const processingMarkers = processingRules
    .filter((rule) => includesAny(text, rule.terms))
    .map((rule) => rule.label);
  const allergens = allergenRules
    .filter((rule) => includesAny(text, rule.terms))
    .map((rule) => rule.label);
  const labelClaims = claimRules
    .filter((rule) => includesAny(text, rule.terms))
    .map((rule) => rule.label);
  const processingLevel = processingLevelFor(processingMarkers.length);
  const confidence = confidenceFor(source, text.length);
  const sourceLabel = options.sourceLabel || sourceForMode(source);
  const hasFullLabel = text.length > 90;
  const clarityScore = Math.min(
    96,
    (hasFullLabel ? 58 : text.length > 35 ? 39 : 24) +
      (bioengineered === "found" ? 14 : 0) +
      (cultivated === "found" ? 14 : 0) +
      (digitalDisclosure === "found" ? 7 : 0) +
      (allergens.length ? 7 : 0) +
      (labelClaims.length ? 4 : 0),
  );

  const evidence: EvidenceFinding[] = [
    {
      id: "bioengineered",
      category: "Bioengineered disclosure",
      state: bioengineered,
      headline:
        bioengineered === "found"
          ? "Disclosure wording found"
          : bioengineered === "not-found"
            ? "No disclosure wording found in supplied evidence"
            : "Not enough label text to decide",
      evidence: findSnippet(input, bioTerms) || "No matching wording appears in the supplied evidence.",
      source: sourceLabel,
      confidence,
      sourceUrl: SOURCE_REFERENCES.bioengineered.url,
      sourceLastReviewed: SOURCE_REFERENCES.bioengineered.lastReviewed,
    },
    {
      id: "cultivated",
      category: "Cultivated or cell-cultured meat",
      state: cultivated,
      headline:
        cultivated === "found"
          ? "Cultivated-meat wording found"
          : cultivated === "not-found"
            ? "No cultivated-meat wording found in supplied evidence"
            : "Not enough label text to decide",
      evidence: findSnippet(input, cultivatedTerms) || "No matching wording appears in the supplied evidence.",
      source: sourceLabel,
      confidence,
      sourceUrl: SOURCE_REFERENCES.cultivated.url,
      sourceLastReviewed: SOURCE_REFERENCES.cultivated.lastReviewed,
    },
    {
      id: "digital",
      category: "Digital disclosure",
      state: digitalDisclosure,
      headline:
        digitalDisclosure === "found"
          ? "A QR or digital disclosure route was captured"
          : digitalDisclosure === "not-found"
            ? "No digital disclosure wording found in supplied evidence"
            : "A clear QR destination was not captured",
      evidence: options.qrUrl || findSnippet(input, digitalTerms) || "No QR destination or matching digital-link wording was supplied.",
      source: sourceLabel,
      confidence: options.qrUrl ? "High" : confidence,
      sourceUrl: SOURCE_REFERENCES.digital.url,
      sourceLastReviewed: SOURCE_REFERENCES.digital.lastReviewed,
    },
  ];

  const parts = [
    bioengineered === "found"
      ? "Bioengineered-food disclosure wording was found in the supplied evidence."
      : bioengineered === "unclear"
        ? "Not enough supplied evidence was available to evaluate bioengineered-food disclosure wording."
      : qrDestinationOnly
        ? "The QR destination was captured, but its linked disclosure text was not read."
      : "No bioengineered-food disclosure was found in the supplied text; that is not proof of absence.",
    cultivated === "found"
      ? "Cultivated or cell-cultured animal wording was found in the supplied evidence."
      : cultivated === "unclear"
        ? "Not enough supplied evidence was available to evaluate cultivated or cell-cultured animal wording."
      : qrDestinationOnly
        ? "Cultivated-meat wording cannot be evaluated from the URL alone."
      : "No cultivated-meat wording was found in the supplied text; that is not proof of absence.",
    processingMarkers.length
      ? `${processingMarkers.length} formulation marker${processingMarkers.length === 1 ? " was" : "s were"} identified.`
      : "No supported ultra-processing markers were detected in the supplied text.",
  ];

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    productName: options.productName?.trim() || (source === "barcode" ? "Demo snack product" : "Scanned food label"),
    createdAt: new Date().toISOString(),
    input,
    source,
    sourceLabel,
    clarityScore,
    confidence,
    bioengineered,
    cultivated,
    digitalDisclosure,
    qrUrl: options.qrUrl,
    barcode: options.barcode,
    processingMarkers,
    processingLevel,
    processingLabel: processingLabels[processingLevel],
    additives,
    allergens,
    labelClaims,
    evidence,
    summary: parts.join(" "),
    productInfo: options.productInfo,
  };
}

export function normalizeSavedReport(report: ScanReport): ScanReport {
  if (
    report.evidence?.every((item) => item.sourceLastReviewed) &&
    report.processingLabel &&
    report.digitalDisclosure
  ) {
    return report;
  }
  const normalized = analyzeText(report.input || "", report.source || "ingredients", {
    productName: report.productName,
    barcode: report.barcode,
    qrUrl: report.qrUrl,
    sourceLabel: report.sourceLabel,
    productInfo: report.productInfo,
  });
  return {
    ...normalized,
    id: report.id || normalized.id,
    createdAt: report.createdAt || normalized.createdAt,
  };
}
