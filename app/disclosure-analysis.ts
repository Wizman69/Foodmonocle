import { DomUtils, parseDocument } from "htmlparser2";
import type {
  DisclosureAnalysisSuccess,
  DisclosureClassification,
  DisclosureEvidence,
  DisclosureObservationState,
} from "./disclosure-types";

type ExtractedSegment = {
  text: string;
  location: DisclosureEvidence["location"];
};

type ExtractedContent = {
  title: string;
  segments: ExtractedSegment[];
  imageOnlyCandidate: boolean;
  identifiableSymbol: ExtractedSegment | null;
};

const containsDisclosurePatterns = [
  /\bcontains\s+(?:a\s+)?bioengineered\s+food\s+ingredient\b/i,
  /\bcontains\s+bioengineered\s+food\s+ingredients\b/i,
  /\bcontains\s+(?:a\s+)?bioengineered\s+ingredient\b/i,
];

const voluntaryDisclosurePatterns = [
  /\bderived\s+from\s+bioengineering\b/i,
  /\bingredients?\s+derived\s+from\s+(?:a\s+)?bioengineered\s+source\b/i,
];

const explicitDisclosurePatterns = [
  /\bbioengineered\s+food\b/i,
  /\bthis\s+product\s+is\s+bioengineered\b/i,
];

const productCues = ["product information", "ingredients", "ingredient list", "nutrition", "allergen", "net weight", "upc", "gtin", "serving size"];
const marketingCues = ["buy now", "add to cart", "shop", "subscribe", "promotion", "special offer", "rewards", "follow us", "our story", "recipes", "discover", "explore products"];
const generalPageCues = ["frequently asked questions", "faq", "about us", "newsroom", "privacy policy", "terms of use", "contact us", "our brands"];
const packageScanPatterns = [
  /scan\s+(?:here|anywhere|this|the\s+code|the\s+icon)?\s*(?:on\s+(?:the\s+)?package)?\s*for\s+more\s+food\s+information/i,
  /scan\s+(?:the\s+)?(?:qr\s+)?code\s+for\s+more\s+food\s+information/i,
];
const packagePhonePattern = /call\s+(?:us\s+at\s+)?(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\s+for\s+more\s+food\s+information/i;

function cleanText(value: string, max = 1200) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function uniqueSegments(segments: ExtractedSegment[]) {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    const key = `${segment.location}:${segment.text.toLowerCase()}`;
    if (!segment.text || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function structuredStrings(value: unknown, output: string[], depth = 0) {
  if (depth > 6 || output.length >= 120) return;
  if (typeof value === "string") {
    const cleaned = cleanText(value, 600);
    if (cleaned) output.push(cleaned);
    return;
  }
  if (Array.isArray(value)) {
    value.slice(0, 60).forEach((item) => structuredStrings(item, output, depth + 1));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).slice(0, 80).forEach((item) => structuredStrings(item, output, depth + 1));
  }
}

function extractHtml(body: string): ExtractedContent {
  const segments: ExtractedSegment[] = [];
  const structuredDocument = parseDocument(body, { decodeEntities: true, lowerCaseAttributeNames: true, lowerCaseTags: true });
  const scripts = DomUtils.findAll((element) => element.name === "script", structuredDocument.children);
  for (const script of scripts.slice(0, 20)) {
    if (!/^application\/(?:ld\+)?json\b/i.test(script.attribs.type || "")) continue;
    try {
      const parsed = JSON.parse(DomUtils.textContent(script)) as unknown;
      const values: string[] = [];
      structuredStrings(parsed, values);
      values.forEach((value) => segments.push({ text: value, location: "Structured data" }));
    } catch {
      // Malformed structured data is ignored; visible page content remains available.
    }
  }
  const visibleBody = body.replace(/<(script|style|template|noscript)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "");
  const document = parseDocument(visibleBody, { decodeEntities: true, lowerCaseAttributeNames: true, lowerCaseTags: true });
  const nonVisibleElements = DomUtils.findAll(
    (element) => new Set(["script", "style", "template", "noscript"]).has(element.name),
    document.children,
  );
  nonVisibleElements.forEach((element) => DomUtils.removeElement(element));
  const elementSegments: Array<{ names: Set<string>; location: DisclosureEvidence["location"] }> = [
    { names: new Set(["title"]), location: "Page title" },
    { names: new Set(["h1", "h2", "h3", "h4", "h5", "h6"]), location: "Heading" },
    { names: new Set(["p", "li", "dt", "dd", "td", "th"]), location: "Paragraph" },
  ];

  for (const group of elementSegments) {
    const elements = DomUtils.findAll((element) => group.names.has(element.name), document.children);
    for (const element of elements.slice(0, 240)) {
      const value = cleanText(DomUtils.textContent(element));
      if (value) segments.push({ text: value, location: group.location });
    }
  }

  const allElements = DomUtils.findAll(() => true, document.children);
  for (const element of allElements.slice(0, 1200)) {
    const ariaLabel = cleanText(element.attribs["aria-label"] || "", 400);
    if (ariaLabel) segments.push({ text: ariaLabel, location: "Accessible label" });
  }

  const images = DomUtils.findAll((element) => element.name === "img", document.children);
  let imageOnlyCandidate = false;
  let identifiableSymbol: ExtractedSegment | null = null;
  for (const image of images.slice(0, 120)) {
    const alt = cleanText(image.attribs.alt || "", 400);
    const assetDescription = `${image.attribs.src || ""} ${image.attribs.id || ""} ${image.attribs.class || ""}`;
    if (alt) {
      segments.push({ text: alt, location: "Image alt text" });
      if (/\b(?:usda\s+)?bioengineered(?:\s+food)?\s+(?:symbol|disclosure|logo)\b|^bioengineered$/i.test(alt)) {
        identifiableSymbol = { text: alt, location: "Image alt text" };
      }
    } else if (/bioengineer|be[-_ ]?(?:symbol|disclosure|logo)/i.test(assetDescription)) {
      imageOnlyCandidate = true;
    }
  }

  const unique = uniqueSegments(segments).slice(0, 400);
  return {
    title: unique.find((segment) => segment.location === "Page title")?.text || "",
    segments: unique,
    imageOnlyCandidate,
    identifiableSymbol,
  };
}

function extractJson(body: string): ExtractedContent {
  const parsed = JSON.parse(body) as unknown;
  const values: string[] = [];
  structuredStrings(parsed, values);
  const segments = uniqueSegments(values.map((text) => ({ text, location: "Structured data" as const }))).slice(0, 400);
  return { title: "", segments, imageOnlyCandidate: false, identifiableSymbol: null };
}

function extractPlainText(body: string): ExtractedContent {
  const segments = uniqueSegments(
    body
      .split(/\r?\n/)
      .map((line) => cleanText(line, 1200))
      .filter(Boolean)
      .slice(0, 400)
      .map((text) => ({ text, location: "Plain text" as const })),
  );
  return { title: "", segments, imageOnlyCandidate: false, identifiableSymbol: null };
}

function snippetFor(segment: ExtractedSegment, pattern: RegExp) {
  const match = pattern.exec(segment.text);
  if (!match || match.index === undefined) return "";
  const start = Math.max(0, match.index - 70);
  const end = Math.min(segment.text.length, match.index + match[0].length + 90);
  return `${start > 0 ? "..." : ""}${segment.text.slice(start, end).trim()}${end < segment.text.length ? "..." : ""}`;
}

function findEvidence(segments: ExtractedSegment[], patterns: RegExp[]) {
  for (const segment of segments) {
    for (const pattern of patterns) {
      const text = snippetFor(segment, pattern);
      if (text) return { segment, text };
    }
  }
  return null;
}

function observation(value: boolean | null): DisclosureObservationState {
  if (value === null) return "Could not verify";
  return value ? "Observed" : "Not observed";
}

export function analyzeDisclosureContent(input: {
  body: string;
  contentType: string;
  originalUrl: string;
  finalUrl: string;
  redirects: string[];
  retrievedAt: string;
  packageText?: string;
}): DisclosureAnalysisSuccess {
  const contentType = input.contentType.toLowerCase();
  let extracted: ExtractedContent;
  if (contentType.includes("html")) extracted = extractHtml(input.body);
  else if (contentType.includes("json")) extracted = extractJson(input.body);
  else extracted = extractPlainText(input.body);

  const pageText = extracted.segments.map((segment) => segment.text).join(" ");
  const lower = pageText.toLowerCase();
  const productScore = productCues.filter((cue) => lower.includes(cue)).length;
  const marketingScore = marketingCues.filter((cue) => lower.includes(cue)).length;
  const generalPage = generalPageCues.some((cue) => lower.includes(cue));
  const marketingDominated = marketingScore >= 3 && marketingScore > productScore * 2;
  const directProductInformation = productScore >= 2 ? true : marketingDominated || generalPage ? false : null;

  const containsEvidence = findEvidence(extracted.segments, containsDisclosurePatterns);
  const voluntaryEvidence = findEvidence(extracted.segments, voluntaryDisclosurePatterns);
  const explicitEvidence = findEvidence(extracted.segments, explicitDisclosurePatterns);
  const symbolEvidence = extracted.identifiableSymbol;
  const detectedEvidence = containsEvidence || voluntaryEvidence || explicitEvidence || (symbolEvidence ? { segment: symbolEvidence, text: symbolEvidence.text } : null);

  let classification: DisclosureClassification = "Unknown";
  if (generalPage || marketingDominated) classification = "General manufacturer or marketing page";
  else if (containsEvidence) classification = "Explicit contains bioengineered ingredient disclosure";
  else if (voluntaryEvidence) classification = "Voluntary bioengineered disclosure";
  else if (explicitEvidence || symbolEvidence) classification = "Explicit bioengineered-food disclosure";
  else if (directProductInformation === true && !extracted.imageOnlyCandidate) classification = "Product-information page without detected BE disclosure";

  const evidence: DisclosureEvidence[] = [];
  if (detectedEvidence) {
    evidence.push({
      text: detectedEvidence.text,
      location: detectedEvidence.segment.location,
      source: "Manufacturer-provided page",
      confidence: detectedEvidence.segment.location === "Image alt text" || detectedEvidence.segment.location === "Accessible label" ? "Moderate" : "High",
    });
  }

  const packageText = cleanText(input.packageText || "", 5000);
  const hasPackageText = Boolean(packageText);
  const packageScanInstruction = hasPackageText ? packageScanPatterns.some((pattern) => pattern.test(packageText)) : null;
  const packagePhoneDisclosure = hasPackageText ? packagePhonePattern.test(packageText) : null;

  const limitations: string[] = [];
  if (!detectedEvidence) limitations.push("No supported BE disclosure wording was detected in the retrieved content. This is not evidence that the food is not bioengineered.");
  if (extracted.imageOnlyCandidate) limitations.push("Image-based disclosure could not be verified.");
  if (!hasPackageText) limitations.push("Package wording near the QR code was not supplied, so scan-instruction and phone wording could not be verified.");
  if (directProductInformation === null) limitations.push("The retrieved content did not provide enough structure to determine whether it is a direct product-information page.");

  const explanation =
    classification === "Explicit contains bioengineered ingredient disclosure"
      ? "The first retrieved content includes explicit manufacturer-provided wording that the product contains a bioengineered food ingredient."
      : classification === "Explicit bioengineered-food disclosure"
        ? "The first retrieved content includes explicit manufacturer-provided bioengineered-food wording or an identifiable BE symbol description."
        : classification === "Voluntary bioengineered disclosure"
          ? "The first retrieved content includes manufacturer-provided wording associated with a voluntary derived-from-bioengineering disclosure."
          : classification === "Product-information page without detected BE disclosure"
            ? "The retrieved content appears product-specific, but no supported BE disclosure was detected. Missing text does not establish absence."
            : classification === "General manufacturer or marketing page"
              ? "The retrieved content appears general or promotion-focused rather than a focused product-information screen. FoodMonocle is reporting that observation, not a legal conclusion."
              : "The retrieved content could not be classified with enough confidence. FoodMonocle is not making a legal or product-status conclusion.";

  const original = new URL(input.originalUrl);
  const final = new URL(input.finalUrl);
  return {
    status: "analyzed",
    classification,
    originalUrl: original.toString(),
    finalUrl: final.toString(),
    originalDomain: original.hostname,
    finalDomain: final.hostname,
    redirects: input.redirects,
    retrievedAt: input.retrievedAt,
    pageTitle: extracted.title,
    contentType: input.contentType,
    evidence,
    observations: {
      directProductInformation: observation(directProductInformation),
      beDisclosureInFirstContent: observation(Boolean(detectedEvidence)),
      marketingDominated: observation(marketingDominated),
      packageScanInstruction: hasPackageText ? observation(packageScanInstruction) : "Not supplied",
      packagePhoneDisclosure: hasPackageText ? observation(packagePhoneDisclosure) : "Not supplied",
      imageBasedDisclosure: extracted.imageOnlyCandidate ? "Could not verify" : "Not observed",
    },
    explanation,
    limitations,
    analysisText: evidence.map((item) => item.text).join("\n"),
  };
}
