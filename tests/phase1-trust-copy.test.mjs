import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const intelligenceSource = readFileSync(new URL("../app/food-intelligence.ts", import.meta.url), "utf8");
const appCopy = `${pageSource}\n${intelligenceSource}`;

test("phase 1 trust copy avoids unsupported food safety and health claims", () => {
  const unsupportedClaimPhrases = [
    "health or safety score",
    "safe for you",
    "safety certification",
    "safe or recall-free",
    "safety alert service",
  ];

  for (const phrase of unsupportedClaimPhrases) {
    assert.equal(appCopy.includes(phrase), false, `Remove unsupported claim phrase: ${phrase}`);
  }
});

test("phase 1 evidence cards include reviewed source dates and explicit confidence meaning", () => {
  assert.match(intelligenceSource, /sourceLastReviewed\?: string;/);
  assert.match(intelligenceSource, /lastReviewed: "2026-07-14"/);
  assert.match(pageSource, /Last reviewed/);
  assert.match(pageSource, /confidenceLabel/);
  assert.match(pageSource, /Confidence reflects evidence coverage/);
});

test("phase 1 no-match language says supplied evidence is limited", () => {
  assert.match(
    intelligenceSource,
    /No cultivated-meat wording was found in the supplied text; that is not proof of absence\./,
  );
  assert.match(
    intelligenceSource,
    /No matching wording appears in the supplied evidence\./,
  );
});
