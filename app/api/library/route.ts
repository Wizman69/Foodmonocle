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
  const status = /Sign in with ChatGPT/i.test(message) ? 401 : /FOODMONOCLE_OWNER_HMAC_SECRET/i.test(message) ? 503 : 400;
  return Response.json({ error: message }, { status });
}

export async function GET() {
  try {
    const owner = await ownerFromRequest();
    const store = await cloudLibraryStore();
    return Response.json(await listLibraryForOwner(store, owner));
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await ownerFromRequest();
    const payload = (await request.json()) as SyncPayload;
    const store = await cloudLibraryStore();
    return Response.json(await syncLibraryForOwner(store, owner, payload));
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const owner = await ownerFromRequest();
    const payload = (await request.json()) as { recordId?: string; isFavorite?: boolean };
    if (!payload.recordId) return Response.json({ error: "recordId is required." }, { status: 400 });
    const store = await cloudLibraryStore();
    return Response.json(await setFavoriteForOwner(store, owner, payload.recordId, payload.isFavorite === true));
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const owner = await ownerFromRequest();
    const { searchParams } = new URL(request.url);
    const store = await cloudLibraryStore();
    if (searchParams.get("all") === "true") {
      return Response.json(await deleteAllForOwner(store, owner));
    }
    const recordId = searchParams.get("id");
    if (!recordId) return Response.json({ error: "id or all=true is required." }, { status: 400 });
    return Response.json(await deleteScanForOwner(store, owner, recordId));
  } catch (error) {
    return routeError(error);
  }
}
