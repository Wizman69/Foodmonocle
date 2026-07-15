# Codex Prompt: Build FoodMonocle

You are a senior product engineer, food-label information architect, and cautious consumer-health UX writer. Build **FoodMonocle**, a mobile-first PWA and sibling product to FieldMonocle.

## Product idea

FoodMonocle is a plain-English scanner that helps people understand what a food package actually discloses. It checks for:

- U.S. bioengineered-food disclosures, including text, symbols, QR or digital-link language, and related package wording.
- Cultivated, cell-cultured, or animal-cell-culture ingredients.
- Common formulation markers associated with ultra-processed foods.
- Additives, colors, preservatives, emulsifiers, sweeteners, and texture agents, explained by function.
- Major allergens named in the supplied label evidence.
- Marketing and certification claims such as Organic, Non-GMO, natural, no artificial ingredients, vegan, and plant-based.

The product is for transparency and education. It must never call a food dangerous, poison, toxic, clean, dirty, good, or bad solely because of one ingredient or production method. It must distinguish exact label evidence from inference.

## Brand and interface

Make FoodMonocle feel related to FieldMonocle without cloning it:

- Name: **FoodMonocle**
- Tagline: **Read between the labels.**
- Voice: cautious, neighborly, practical, independent, and free of corporate jargon.
- Visual system: crisp off-white background, dark forest green, mint, clear yellow highlights, and a small coral warning accent. No gradients, decorative blobs, oversized rounded cards, or fear-based red scoring.
- Use a monocle/search brand mark and Lucide icons.
- Build the scanner itself as the first screen, not a marketing homepage.
- Keep mobile controls thumb-friendly and add bottom navigation for Scan, Additives, Recalls, Compare, and History.

## Scan inputs

Implement four real input paths:

1. **Label photo:** accept camera or photo input, strip EXIF metadata on-device, compress before upload, run OCR, and preserve the image so the user can verify every extracted phrase.
2. **Barcode:** resolve UPC/EAN through Open Food Facts first, then a pluggable commercial product database if needed. Show data freshness and source.
3. **QR or digital disclosure:** decode package QR codes, show the destination, and analyze disclosure text the user supplies. Never claim the linked page was read unless the app actually fetched and parsed it.
4. **Ingredient text:** allow paste or typing as the reliable fallback.

Never silently invent OCR text or product data. Low-quality images must return a request for a clearer photo or missing panel.

## Result model

Return a structured report with:

- Product name, brand, barcode, source, scan date, and data freshness.
- A **Label clarity** score that measures evidence coverage, not health quality.
- Evidence confidence: High, Moderate, or Low.
- Finding states: Found on label, Not found in supplied evidence, or Not enough evidence.
- Bioengineered disclosure finding with the exact supporting phrase and location.
- Cultivated or cell-cultured ingredient finding with the exact supporting phrase.
- Ultra-processing markers as a descriptive heuristic, not a safety conclusion.
- Additive list with plain-English function, evidence source, and a neutral note.
- Major allergens and possible cross-contact wording, with a warning to verify the physical package.
- Marketing claims and any apparent tension between front-of-pack claims and the ingredient panel.
- “What could make this wrong?” and “What to scan next?” sections.
- Source links and the last-reviewed date for every regulatory rule.
- “Was this useful?” and correction-report controls.

## Selected implementation scope

Implement all eight selected additions:

1. **Real label photo scanning:** run OCR locally in the browser and put extracted text into an editable review field before or alongside analysis.
2. **Evidence cards:** show the exact matching phrase, evidence source, confidence, finding state, and an official reference for every major conclusion.
3. **QR or digital disclosure checker:** decode package QR images or accept a pasted destination/disclosure. A URL alone must return “not enough evidence” for ingredient conclusions.
4. **Ultra-processed ingredient meter:** use a transparent 0–4 formulation-signal meter with named markers. It is descriptive, never a health score.
5. **Additive dictionary:** include a searchable guide with aliases, function, family, and neutral plain-English notes, then link scan matches to it.
6. **Cultivated or lab-grown meat detector:** recognize cultivated, cell-cultured, cell-based, and cultured-animal-cell wording without treating ordinary cultured foods as matches.
7. **Recall watch:** search FDA food-enforcement records by product or brand, show dates/classification/reason, and link separately to official FDA and USDA-FSIS recall pages.
8. **Compare products:** compare two saved scans side by side across disclosures, formulation signals, additives, allergens, and evidence confidence without declaring a winner.

Retain local scan history to support comparison. Do **not** add personal preference filters or a dedicated missing-information checklist in this version.

## Data and architecture

- Use the repository's existing framework and conventions.
- Use TypeScript and schema-validated structured output.
- Keep regulatory rules, additive definitions, label terms, and citations in versioned data files or database tables, not scattered UI strings.
- Use Open Food Facts for open barcode data, while showing that community data may be incomplete.
- Use official USDA AMS sources for the National Bioengineered Food Disclosure Standard.
- Use official FDA and USDA-FSIS sources for food made with cultured animal cells.
- Use official FDA and USDA recall feeds for recall checks.
- Keep OCR extraction separate from classification so users can correct text before analysis.
- Store the original evidence span and bounding box for every image-derived finding.
- Add rate limits, upload validation, content-type checks, and deletion controls.
- Do not retain label photos unless the user explicitly saves a report.
- Add Privacy, Terms, Refund, Data Sources, and Method pages before payments go live.

## Required states and tests

Build complete empty, loading, success, low-confidence, no-match, offline, image-too-blurry, barcode-not-found, partial-label, and service-error states.

Test:

- Exact bioengineered disclosure phrases and common variants.
- Cultivated-food phrases without falsely matching ordinary cultured foods such as yogurt.
- Additive aliases and word-boundary false positives.
- Allergen detection and “may contain” separation.
- Missing-panel and low-confidence behavior.
- Barcode freshness and fallback behavior.
- Recall match precision.
- Keyboard access, screen-reader labels, focus management, and reduced motion.
- Desktop and mobile layouts with no clipping or overlap.

## Product guardrails

- Do not diagnose health effects or give medical advice.
- Do not imply that bioengineered or cultivated foods are inherently unsafe.
- Do not imply that “not found” means “not present”; it means not found in the supplied evidence.
- Do not claim regulatory approval when an agency only completed a consultation or review step.
- Do not hide uncertainty or source dates.
- Do not launch payment until image extraction and finding precision have been manually evaluated on a representative label set.

Deliver the usable app first, then briefly document the architecture, data sources, limitations, tests run, and the next production milestone.
