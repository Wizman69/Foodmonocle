import { getChatGPTUser } from "../../chatgpt-auth";
import {
  deleteAllForOwner,
  deleteScanForOwner,
  listLibraryForOwner,
  requireAuthenticatedOwner,
  setFavoriteForOwner,
  syncLibraryForOwner,
  type SyncPayload,
} from "../../cloud-library";
import { ApiRequestError, apiJson, assertSameOrigin, readJsonRequest } from "../../api-security.ts";

const MAX_LIBRARY_REQUEST_BYTES = 512 * 1024;

function ownerSecret() {
  return process.env.FOODMONOCLE_OWNER_HMAC_SECRET || "";
}

async function ownerFromRequest() {
  return requireAuthenticatedOwner(await getChatGPTUser(), ownerSecret());
}

async function cloudLibraryStore() {
  const { createD1CloudLibraryStore } = await import("../../cloud-library-db");
  return createD1CloudLibraryStore();
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "FoodMonocle library request failed.";
  if (error instanceof ApiRequestError) return apiJson({ error: message }, error.status);
  const status = /Sign in with ChatGPT/i.test(message) ? 401 : /FOODMONOCLE_OWNER_HMAC_SECRET/i.test(message) ? 503 : 400;
  const knownMessage = /Sign in with ChatGPT|FOODMONOCLE_OWNER_HMAC_SECRET|consent|required|not found/i.test(message)
    ? message
    : "The synchronized library is temporarily unavailable.";
  return apiJson({ error: knownMessage }, status);
}

export async function GET() {
  try {
    const owner = await ownerFromRequest();
    const store = await cloudLibraryStore();
    return apiJson(await listLibraryForOwner(store, owner));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await ownerFromRequest();
    const payload = await readJsonRequest<SyncPayload>(request, MAX_LIBRARY_REQUEST_BYTES);
    const store = await cloudLibraryStore();
    return apiJson(await syncLibraryForOwner(store, owner, payload));
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const owner = await ownerFromRequest();
    const payload = await readJsonRequest<{ recordId?: string; isFavorite?: boolean }>(request, 8 * 1024);
    if (!payload.recordId) return apiJson({ error: "recordId is required." }, 400);
    const store = await cloudLibraryStore();
    return apiJson(await setFavoriteForOwner(store, owner, payload.recordId.slice(0, 128), payload.isFavorite === true));
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const owner = await ownerFromRequest();
    const { searchParams } = new URL(request.url);
    const store = await cloudLibraryStore();
    if (searchParams.get("all") === "true") {
      return apiJson(await deleteAllForOwner(store, owner));
    }
    const recordId = searchParams.get("id");
    if (!recordId) return apiJson({ error: "id or all=true is required." }, 400);
    return apiJson(await deleteScanForOwner(store, owner, recordId.slice(0, 128)));
  } catch (error) {
    return routeError(error);
  }
}
