import { analyzeDisclosureUrl, disclosureFailure, DisclosureReaderError } from "../../disclosure-reader.ts";

const MAX_REQUEST_BYTES = 16 * 1024;

async function readBoundedRequest(request: Request) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new DisclosureReaderError("request_too_large", "The disclosure request is too large.", "blocked", 413);
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json({ error: "The disclosure request is too large." }, 413);
  }

  let raw = "";
  let input: { url?: unknown; packageText?: unknown };
  try {
    raw = await readBoundedRequest(request);
    input = JSON.parse(raw) as { url?: unknown; packageText?: unknown };
  } catch (error) {
    if (error instanceof DisclosureReaderError && error.code === "request_too_large") return json({ error: error.message }, 413);
    return json({ error: "Send a valid JSON disclosure request." }, 400);
  }

  const url = typeof input.url === "string" ? input.url.trim() : "";
  const packageText = typeof input.packageText === "string" ? input.packageText.trim().slice(0, 5000) : "";
  try {
    return json(await analyzeDisclosureUrl(url, packageText));
  } catch (error) {
    const failure = disclosureFailure(error, url);
    return json(failure, error instanceof DisclosureReaderError ? error.httpStatus : 502);
  }
}
