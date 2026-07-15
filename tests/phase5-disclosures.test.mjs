import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readerUrl = new URL("../app/disclosure-reader.ts", import.meta.url);
const analysisUrl = new URL("../app/disclosure-analysis.ts", import.meta.url);
const routeUrl = new URL("../app/api/disclosure/route.ts", import.meta.url);

async function loadReader() {
  return import(readerUrl.href);
}

async function loadAnalysis() {
  return import(analysisUrl.href);
}

async function loadRoute() {
  return import(routeUrl.href);
}

const publicResolver = {
  resolve4: async () => ["8.8.8.8"],
  resolve6: async () => [],
};

const fixedNow = () => "2026-07-15T16:30:00.000Z";

function html(body, init = {}) {
  return new Response(body, {
    status: init.status ?? 200,
    headers: { "content-type": "text/html; charset=utf-8", ...init.headers },
  });
}

function productPage(disclosure = "") {
  return `<!doctype html><html><head><title>Harvest Corn Chips</title></head><body><main><h1>Harvest Corn Chips</h1><h2>Product information</h2><p>Ingredients: corn, oil, salt.</p><p>Nutrition and serving size information.</p><p>${disclosure}</p></main></body></html>`;
}

test("classifies a direct explicit BE disclosure and extracts an exact snippet", async () => {
  const { analyzeDisclosureContent } = await loadAnalysis();
  const result = analyzeDisclosureContent({
    body: productPage("This product is bioengineered."),
    contentType: "text/html",
    originalUrl: "https://labels.example.org/corn",
    finalUrl: "https://labels.example.org/corn",
    redirects: [],
    retrievedAt: fixedNow(),
  });
  assert.equal(result.classification, "Explicit bioengineered-food disclosure");
  assert.equal(result.evidence[0].text, "This product is bioengineered.");
  assert.equal(result.evidence[0].source, "Manufacturer-provided page");
  assert.equal(result.evidence[0].confidence, "High");
});

test("classifies contains-a-bioengineered-food-ingredient wording", async () => {
  const { analyzeDisclosureContent } = await loadAnalysis();
  const result = analyzeDisclosureContent({
    body: productPage("Contains a bioengineered food ingredient."),
    contentType: "text/html",
    originalUrl: "https://labels.example.org/corn",
    finalUrl: "https://labels.example.org/corn",
    redirects: [],
    retrievedAt: fixedNow(),
  });
  assert.equal(result.classification, "Explicit contains bioengineered ingredient disclosure");
  assert.match(result.analysisText, /Contains a bioengineered food ingredient/);
});

test("classifies voluntary derived-from-bioengineering wording", async () => {
  const { analyzeDisclosureContent } = await loadAnalysis();
  const result = analyzeDisclosureContent({
    body: productPage("Corn syrup derived from bioengineering."),
    contentType: "text/html",
    originalUrl: "https://labels.example.org/corn",
    finalUrl: "https://labels.example.org/corn",
    redirects: [],
    retrievedAt: fixedNow(),
  });
  assert.equal(result.classification, "Voluntary bioengineered disclosure");
});

test("product pages without detected disclosure preserve uncertainty rather than claiming absence", async () => {
  const { analyzeDisclosureContent } = await loadAnalysis();
  const result = analyzeDisclosureContent({
    body: productPage("Product details are shown above."),
    contentType: "text/html",
    originalUrl: "https://labels.example.org/corn",
    finalUrl: "https://labels.example.org/corn",
    redirects: [],
    retrievedAt: fixedNow(),
  });
  assert.equal(result.classification, "Product-information page without detected BE disclosure");
  assert.equal(result.evidence.length, 0);
  assert.match(result.limitations.join(" "), /not evidence that the food is not bioengineered/i);
  assert.doesNotMatch(result.explanation, /does not contain|is not bioengineered/i);
});

test("general marketing content is classified separately from a product disclosure", async () => {
  const { analyzeDisclosureContent } = await loadAnalysis();
  const result = analyzeDisclosureContent({
    body: "<html><head><title>Our brands</title></head><body><h1>About us</h1><p>Shop, subscribe, discover recipes, follow us, and explore products.</p></body></html>",
    contentType: "text/html",
    originalUrl: "https://brand.example.org/about",
    finalUrl: "https://brand.example.org/about",
    redirects: [],
    retrievedAt: fixedNow(),
  });
  assert.equal(result.classification, "General manufacturer or marketing page");
  assert.equal(result.observations.marketingDominated, "Observed");
});

test("follows a safe redirect and attributes original, final, and retrieval details", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  const calls = [];
  const result = await analyzeDisclosureUrl("https://qr.example.org/go", "Scan here for more food information. Call 1-800-555-1212 for more food information.", {
    resolver: publicResolver,
    now: fixedNow,
    fetchImpl: async (url, init) => {
      calls.push({ url: url.toString(), init });
      if (url.toString() === "https://qr.example.org/go") return new Response(null, { status: 302, headers: { location: "https://product.example.org/corn" } });
      return html(productPage("Contains bioengineered food ingredients."));
    },
  });
  assert.equal(result.originalUrl, "https://qr.example.org/go");
  assert.equal(result.finalUrl, "https://product.example.org/corn");
  assert.deepEqual(result.redirects, ["https://product.example.org/corn"]);
  assert.equal(result.retrievedAt, fixedNow());
  assert.equal(result.observations.packageScanInstruction, "Observed");
  assert.equal(result.observations.packagePhoneDisclosure, "Observed");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.redirect, "manual");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls[0].init.headers.Cookie, undefined);
  assert.equal(calls[0].init.headers.Referer, undefined);
});

test("rejects a redirect to an unsafe local destination before fetching it", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  let fetchCount = 0;
  await assert.rejects(
    analyzeDisclosureUrl("https://qr.example.org/go", "", {
      resolver: publicResolver,
      fetchImpl: async () => {
        fetchCount += 1;
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
      },
    }),
    (error) => error.code === "unsafe_redirect" && /private|local|reserved|metadata/i.test(error.message),
  );
  assert.equal(fetchCount, 1);
});

test("blocks localhost and private IP destinations", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  await assert.rejects(analyzeDisclosureUrl("http://localhost/disclosure"), (error) => error.kind === "blocked");
  await assert.rejects(analyzeDisclosureUrl("http://192.168.1.10/disclosure"), (error) => error.code === "blocked_address");
  await assert.rejects(analyzeDisclosureUrl("http://2130706433/disclosure"), (error) => error.code === "blocked_address");
  await assert.rejects(analyzeDisclosureUrl("http://[::1]/disclosure"), (error) => error.code === "blocked_address");
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/corn", "", {
      resolver: { resolve4: async () => ["10.0.0.8"], resolve6: async () => [] },
    }),
    (error) => error.code === "blocked_address",
  );
});

test("blocks obfuscated IPv4 and IPv4-mapped IPv6 forms after URL normalization", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  const destinations = [
    "http://2130706433/disclosure",
    "http://0x7f000001/disclosure",
    "http://0177.0.0.1/disclosure",
    "http://127.1/disclosure",
    "http://%31%32%37.0.0.1/disclosure",
    "http://[::ffff:127.0.0.1]/disclosure",
    "http://[::ffff:7f00:1]/disclosure",
    "http://[::ffff:a00:1]/disclosure",
  ];
  for (const destination of destinations) {
    await assert.rejects(analyzeDisclosureUrl(destination), (error) => error.code === "blocked_address");
  }
});

test("blocks link-local, multicast, reserved, documentation, and metadata address ranges", async () => {
  const { isPublicDestinationAddress } = await loadReader();
  const blocked = [
    "0.0.0.0", "100.64.0.1", "169.254.1.2", "192.0.2.4", "198.18.0.1", "198.51.100.9", "203.0.113.7", "224.0.0.1", "240.0.0.1",
    "::", "::1", "fe80::1", "fc00::1", "ff02::1", "2001:db8::1", "2001::1", "2002::1", "3fff::1", "fd00:ec2::254",
  ];
  blocked.forEach((address) => assert.equal(isPublicDestinationAddress(address), false, address));
  assert.equal(isPublicDestinationAddress("8.8.8.8"), true);
  assert.equal(isPublicDestinationAddress("2606:4700:4700::1111"), true);
});

test("canonicalizes a single trailing or Unicode dot and rejects normalization and port tricks", async () => {
  const { validateDisclosureUrl } = await loadReader();
  assert.equal(validateDisclosureUrl("https://Example.COM./label#fragment").toString(), "https://example.com/label");
  assert.equal(validateDisclosureUrl("https://example。com/label").hostname, "example.com");
  assert.throws(() => validateDisclosureUrl("https://example.com../label"), (error) => error.code === "invalid_hostname");
  assert.throws(() => validateDisclosureUrl("https://example.com:444/label"), (error) => error.code === "blocked_port");
  assert.throws(() => validateDisclosureUrl("http://127.0.0.1\\@example.com/label"), (error) => error.code === "blocked_address");
});

test("blocks cloud metadata destinations and embedded credentials", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  await assert.rejects(analyzeDisclosureUrl("http://169.254.169.254/latest/meta-data"), (error) => error.code === "blocked_address");
  await assert.rejects(analyzeDisclosureUrl("https://user:password@labels.example.org/corn"), (error) => error.code === "embedded_credentials");
});

test("blocks DNS rebinding and alternate-address changes", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  let lookup = 0;
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/corn", "", {
      resolver: {
        resolve4: async () => [lookup++ === 0 ? "8.8.8.8" : "1.1.1.1"],
        resolve6: async () => [],
      },
      fetchImpl: async () => html(productPage("Contains bioengineered food ingredients.")),
    }),
    (error) => error.code === "dns_rebinding" && error.kind === "blocked",
  );
});

test("rejects oversized responses from content length or streamed bytes", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/corn", "", {
      resolver: publicResolver,
      maxBytes: 32,
      fetchImpl: async () => html("short", { headers: { "content-length": "100" } }),
    }),
    (error) => error.code === "oversized_response",
  );
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/corn", "", {
      resolver: publicResolver,
      maxBytes: 16,
      fetchImpl: async () => html("This streamed response is longer than sixteen bytes."),
    }),
    (error) => error.code === "oversized_response",
  );
});

test("enforces the default 512 KB limit on a streamed response without Content-Length", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  const oversized = new Uint8Array(512 * 1024 + 1).fill(0x61);
  const oversizedResponse = () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(oversized.subarray(0, 300000));
      controller.enqueue(oversized.subarray(300000));
      controller.close();
    },
  }), { headers: { "content-type": "text/plain" } });
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/large", "", {
      resolver: publicResolver,
      fetchImpl: async () => oversizedResponse(),
    }),
    (error) => error.code === "oversized_response",
  );
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/large", "", {
      resolver: publicResolver,
      maxBytes: 1024 * 1024,
      fetchImpl: async () => oversizedResponse(),
    }),
    (error) => error.code === "oversized_response",
  );
});

test("rejects unsupported content types", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/file.pdf", "", {
      resolver: publicResolver,
      fetchImpl: async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
    }),
    (error) => error.code === "unsupported_content_type",
  );
});

test("rejects binary or structurally misleading bodies under supported content types", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  const cases = [
    new Response(new Uint8Array([0x20, 0x0a, 0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), { headers: { "content-type": "text/html" } }),
    new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), { headers: { "content-type": "text/plain" } }),
    new Response("not markup", { headers: { "content-type": "text/html" } }),
    new Response("<html>not JSON</html>", { headers: { "content-type": "application/json" } }),
  ];
  for (const response of cases) {
    await assert.rejects(
      analyzeDisclosureUrl("https://labels.example.org/misleading", "", { resolver: publicResolver, fetchImpl: async () => response }),
      (error) => error.code === "misleading_content_type",
    );
  }
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/broken.json", "", {
      resolver: publicResolver,
      fetchImpl: async () => new Response('{"broken":', { headers: { "content-type": "application/json" } }),
    }),
    (error) => error.code === "malformed_json",
  );
});

test("reports timeout and network failures without exposing fetch details", async () => {
  const { analyzeDisclosureUrl, disclosureFailure } = await loadReader();
  let timeoutError;
  try {
    await analyzeDisclosureUrl("https://labels.example.org/slow", "", {
      resolver: publicResolver,
      requestTimeoutMs: 10,
      totalTimeoutMs: 50,
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))),
    });
  } catch (error) {
    timeoutError = error;
  }
  assert.equal(timeoutError.code, "request_timeout");
  assert.equal(disclosureFailure(timeoutError, "https://labels.example.org/slow", fixedNow).message, "The disclosure page request timed out.");

  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/offline", "", {
      resolver: publicResolver,
      fetchImpl: async () => { throw new Error("socket details must not escape"); },
    }),
    (error) => error.code === "network_error" && !error.message.includes("socket details"),
  );
});

test("cancels a response stream that exceeds the body-read timeout", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull() {},
    cancel() { cancelled = true; },
  }), { headers: { "content-type": "text/html" } });
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/slow-body", "", {
      resolver: publicResolver,
      requestTimeoutMs: 10,
      totalTimeoutMs: 100,
      fetchImpl: async () => response,
    }),
    (error) => error.code === "response_timeout",
  );
  assert.equal(cancelled, true);
});

test("malformed HTML is parsed without executing or requiring page scripts", async () => {
  const { analyzeDisclosureContent } = await loadAnalysis();
  const result = analyzeDisclosureContent({
    body: "<html><title>Broken product<title><body><h1>Product information<p>Ingredients: corn<p>Contains a bioengineered food ingredient<script>alert('never')</script>",
    contentType: "text/html",
    originalUrl: "https://labels.example.org/broken",
    finalUrl: "https://labels.example.org/broken",
    redirects: [],
    retrievedAt: fixedNow(),
  });
  assert.equal(result.classification, "Explicit contains bioengineered ingredient disclosure");
  assert.doesNotMatch(result.analysisText, /alert|never/);
});

test("reports image-only disclosure uncertainty", async () => {
  const { analyzeDisclosureContent } = await loadAnalysis();
  const result = analyzeDisclosureContent({
    body: '<html><body><h1>Product information</h1><p>Ingredients: corn.</p><p>Nutrition and serving size.</p><img src="/assets/be-symbol.png"></body></html>',
    contentType: "text/html",
    originalUrl: "https://labels.example.org/image",
    finalUrl: "https://labels.example.org/image",
    redirects: [],
    retrievedAt: fixedNow(),
  });
  assert.equal(result.observations.imageBasedDisclosure, "Could not verify");
  assert.match(result.limitations.join(" "), /Image-based disclosure could not be verified/);
  assert.notEqual(result.classification, "Explicit bioengineered-food disclosure");
});

test("extracts supported JSON-LD text without evaluating it", async () => {
  const { analyzeDisclosureContent } = await loadAnalysis();
  const result = analyzeDisclosureContent({
    body: '<html><head><script type="application/ld+json">{"name":"Corn chips","description":"Contains bioengineered food ingredients."}</script></head><body><h1>Product information</h1><p>Ingredients</p></body></html>',
    contentType: "text/html",
    originalUrl: "https://labels.example.org/jsonld",
    finalUrl: "https://labels.example.org/jsonld",
    redirects: [],
    retrievedAt: fixedNow(),
  });
  assert.equal(result.evidence[0].location, "Structured data");
  assert.equal(result.classification, "Explicit contains bioengineered ingredient disclosure");
});

test("limits redirect count", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/0", "", {
      resolver: publicResolver,
      maxRedirects: 1,
      fetchImpl: async (url) => new Response(null, { status: 302, headers: { location: url.toString().endsWith("/0") ? "/1" : "/2" } }),
    }),
    (error) => error.code === "too_many_redirects",
  );
});

test("detects redirect loops and permits no more than four redirects by default", async () => {
  const { analyzeDisclosureUrl } = await loadReader();
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/a", "", {
      resolver: publicResolver,
      fetchImpl: async (url) => new Response(null, { status: 302, headers: { location: url.toString().endsWith("/a") ? "/b" : "/a" } }),
    }),
    (error) => error.code === "redirect_loop",
  );

  let redirects = 0;
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/0", "", {
      resolver: publicResolver,
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: `/${++redirects}` } }),
    }),
    (error) => error.code === "too_many_redirects" && redirects === 5,
  );

  redirects = 0;
  await assert.rejects(
    analyzeDisclosureUrl("https://labels.example.org/0", "", {
      resolver: publicResolver,
      maxRedirects: 99,
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: `/${++redirects}` } }),
    }),
    (error) => error.code === "too_many_redirects" && redirects === 5,
  );
});

test("QR UI requires destination review before server retrieval and explains privacy", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /qrPreview \? analyzeQrDisclosure : prepareQrDisclosure/);
  assert.match(page, /Review QR destination/);
  assert.match(page, /Analyze disclosure/);
  assert.match(page, /contacts this website through FoodMonocle/);
  assert.match(page, /without scripts, cookies, account identity, or referrer information/);
  assert.doesNotMatch(page, /window\.open\(qr|location\.href\s*=\s*qr/i);
});

test("disclosure reader does not log fetched content or authentication data", async () => {
  const reader = await readFile(new URL("../app/disclosure-reader.ts", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/disclosure/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(`${reader}\n${route}`, /console\.(?:log|info|warn|error)|request\.headers\.get\(["'](?:authorization|cookie)/i);
  assert.match(reader, /credentials: "omit"/);
  assert.match(reader, /referrerPolicy: "no-referrer"/);
  assert.match(reader, /redirect: "manual"/);
});

test("API route rejects a chunked request while reading past 16 KB", async () => {
  const { POST } = await loadRoute();
  let cancelled = false;
  const request = new Request("https://foodmonocle.example/api/disclosure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(9000).fill(0x61));
        controller.enqueue(new Uint8Array(9000).fill(0x62));
      },
      cancel() { cancelled = true; },
    }),
    duplex: "half",
  });
  const response = await POST(request);
  assert.equal(response.status, 413);
  assert.equal(cancelled, true);
  assert.deepEqual(await response.json(), { error: "The disclosure request is too large." });
});
