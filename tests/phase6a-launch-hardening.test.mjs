import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appUrl = new URL("../app/", import.meta.url);

test("normalizes supported UPC, EAN, and GTIN captures and rejects invalid checksums", async () => {
  const { normalizeGtin } = await import(new URL("camera-scanner.ts", appUrl));
  assert.equal(normalizeGtin("036000291452"), "036000291452");
  assert.equal(normalizeGtin("9638 5074"), "96385074");
  assert.equal(normalizeGtin("4006381333931"), "4006381333931");
  assert.equal(normalizeGtin("10012345000017"), "10012345000017");
  assert.equal(normalizeGtin("036000291453"), "");
  assert.equal(normalizeGtin("123456"), "");
  assert.equal(normalizeGtin("javascript:alert(1)"), "");
});

test("reports permission denial and unsupported camera APIs with usable fallbacks", async () => {
  const { cameraErrorMessage, isCameraInputSupported } = await import(new URL("camera-scanner.ts", appUrl));
  assert.match(cameraErrorMessage(new DOMException("denied", "NotAllowedError")), /permission was denied/i);
  assert.match(cameraErrorMessage(new DOMException("unsupported", "NotSupportedError")), /type the barcode|uploaded QR image/i);
  assert.equal(isCameraInputSupported({ mediaDevices: undefined }), false);
  assert.equal(isCameraInputSupported({ mediaDevices: { getUserMedia() {} } }), true);
});

test("camera cleanup stops every track, pauses video, and clears the stream", async () => {
  const { stopCameraMedia } = await import(new URL("camera-scanner.ts", appUrl));
  let stopped = 0;
  let paused = 0;
  const video = {
    srcObject: { getTracks: () => [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }] },
    pause: () => { paused += 1; },
  };
  stopCameraMedia(video);
  assert.equal(stopped, 2);
  assert.equal(paused, 1);
  assert.equal(video.srcObject, null);
});

test("native barcode detection falls back unless every core UPC and EAN format is supported", async () => {
  const { getNativeScannerFormats } = await import(new URL("camera-scanner.ts", appUrl));
  assert.equal(await getNativeScannerFormats("barcode", {
    getSupportedFormats: async () => ["ean_13", "qr_code"],
  }), null);
  assert.deepEqual(await getNativeScannerFormats("barcode", {
    getSupportedFormats: async () => ["upc_a", "upc_e", "ean_8", "ean_13", "code_128"],
  }), ["upc_a", "upc_e", "ean_8", "ean_13", "code_128"]);
  assert.deepEqual(await getNativeScannerFormats("qr", {
    getSupportedFormats: async () => ["qr_code"],
  }), ["qr_code"]);
  assert.equal(await getNativeScannerFormats("qr", {
    getSupportedFormats: async () => { throw new Error("capability query failed"); },
  }), null);
});

test("camera startup paths clean partial streams and retain ZXing fallback", async () => {
  const [scanner, page] = await Promise.all([
    readFile(new URL("camera-scanner.ts", appUrl), "utf8"),
    readFile(new URL("page.tsx", appUrl), "utf8"),
  ]);
  assert.match(scanner, /catch \(error\) \{\s*if \(stream && options\.video\.srcObject === stream\) stopCameraMedia/);
  assert.match(scanner, /if \(!isNativeCapabilityError\(error\)\) throw error/);
  assert.match(scanner, /return startZxingScanner\(options\)/);
  assert.match(page, /Camera stopped when another panel opened/);
  assert.match(page, /if \(!video\) \{\s*setCameraMode\(null\);\s*setCameraState\("error"\)/);
});

test("request helper times out and propagates caller cancellation", async () => {
  const { fetchWithTimeout, RequestTimeoutError } = await import(new URL("request-resilience.ts", appUrl));
  const waitingFetch = async (_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason || new DOMException("Aborted", "AbortError")), { once: true });
  });
  await assert.rejects(fetchWithTimeout("https://example.test", {}, 5, waitingFetch), RequestTimeoutError);

  const controller = new AbortController();
  const cancelled = fetchWithTimeout("https://example.test", { signal: controller.signal }, 1000, waitingFetch);
  controller.abort(new DOMException("User cancelled", "AbortError"));
  await assert.rejects(cancelled, (error) => error.name === "AbortError");
});

test("recall search preserves FDA results when USDA-FSIS is unavailable", async () => {
  const { searchOfficialRecalls } = await import(new URL("recall-engine.ts", appUrl));
  const response = await searchOfficialRecalls({ product: "corn chips" }, async (url) => {
    if (String(url).includes("api.fda.gov")) {
      return Response.json({
        meta: { last_updated: "2026-07-15" },
        results: [{ recall_number: "F-100", product_description: "Corn chips", recalling_firm: "Example Foods", reason_for_recall: "Label issue", report_date: "20260715" }],
      });
    }
    throw new Error("FSIS unavailable");
  }, () => "2026-07-15T12:00:00.000Z");
  assert.equal(response.results.length, 1);
  assert.equal(response.sources.find((source) => source.agency === "FDA")?.status, "available");
  assert.equal(response.sources.find((source) => source.agency === "USDA-FSIS")?.status, "unavailable");
  assert.match(response.warnings.join(" "), /USDA-FSIS/i);
});

test("API JSON reader enforces same-origin, content type, and streamed body limits", async () => {
  const { readJsonRequest } = await import(new URL("api-security.ts", appUrl));
  await assert.rejects(
    readJsonRequest(new Request("https://foodmonocle.test/api/library", { method: "POST", headers: { origin: "https://attacker.test", "content-type": "application/json" }, body: "{}" }), 1024),
    (error) => error.status === 403,
  );
  await assert.rejects(
    readJsonRequest(new Request("https://foodmonocle.test/api/library", { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" }), 1024),
    (error) => error.status === 415,
  );
  let cancelled = false;
  const request = new Request("https://foodmonocle.test/api/library", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(700));
        controller.enqueue(new Uint8Array(700));
      },
      cancel() { cancelled = true; },
    }),
    duplex: "half",
  });
  await assert.rejects(readJsonRequest(request, 1024), (error) => error.status === 413);
  assert.equal(cancelled, true);
});

test("QR camera capture still requires review and intentional disclosure analysis", async () => {
  const page = await readFile(new URL("page.tsx", appUrl), "utf8");
  assert.match(page, /Scan QR with camera/);
  assert.match(page, /setQrPreview\(null\)/);
  assert.match(page, /Review QR destination/);
  assert.match(page, /qrPreview \? analyzeQrDisclosure : prepareQrDisclosure/);
  assert.doesNotMatch(page, /window\.open\(|location\.href\s*=/);
});

test("scanner UI exposes keyboard tabs, live statuses, focus return, and narrow layout rules", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("page.tsx", appUrl), "utf8"),
    readFile(new URL("globals.css", appUrl), "utf8"),
  ]);
  assert.match(page, /handleModeTabKey/);
  assert.match(page, /aria-controls="scan-panel-barcode"/);
  assert.match(page, /role="status" aria-live="polite"/);
  assert.match(page, /dialogReturnFocusRef\.current\?\.focus\(\)/);
  assert.match(page, /event\.key !== "Tab"/);
  assert.match(css, /@media \(max-width: 390px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /outline: 3px solid #e0bd24/);
});

test("duplicate submissions are guarded and camera/request resources are cleaned up", async () => {
  const page = await readFile(new URL("page.tsx", appUrl), "utf8");
  assert.match(page, /if \(scanInFlightRef\.current\) return/);
  assert.match(page, /if \(recallInFlightRef\.current\) return/);
  assert.match(page, /cameraSessionRef\.current\?\.stop\(\)/);
  assert.match(page, /scanRequestRef\.current\?\.abort\(\)/);
  assert.match(page, /recallRequestRef\.current\?\.abort\(\)/);
});

test("privacy copy covers local, synchronized, external-source, image, and tracking behavior", async () => {
  const page = await readFile(new URL("page.tsx", appUrl), "utf8");
  for (const phrase of [
    "Signed-out history",
    "D1 stores extracted label text",
    "Open Food Facts",
    "FDA and USDA-FSIS",
    "live camera frames",
    "uploaded label images",
    "third-party advertising or behavioral tracking",
  ]) assert.match(page, new RegExp(phrase, "i"));
});

test("secrets stay server-only and conservative Worker headers are present", async () => {
  const [page, worker, auth, route] = await Promise.all([
    readFile(new URL("page.tsx", appUrl), "utf8"),
    readFile(new URL("../worker/index.ts", appUrl), "utf8"),
    readFile(new URL("chatgpt-auth.ts", appUrl), "utf8"),
    readFile(new URL("api/library/route.ts", appUrl), "utf8"),
  ]);
  assert.doesNotMatch(page, /FOODMONOCLE_OWNER_HMAC_SECRET|process\.env/);
  assert.match(route, /process\.env\.FOODMONOCLE_OWNER_HMAC_SECRET/);
  assert.match(route, /getChatGPTUser\(\)/);
  assert.doesNotMatch(`${auth}\n${route}`, /console\.(?:log|info|warn|error)|request\.headers\.get\(["'](?:authorization|cookie)/i);
  for (const header of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy", "Cross-Origin-Resource-Policy"]) {
    assert.match(worker, new RegExp(header));
  }
});
