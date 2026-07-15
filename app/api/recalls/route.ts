import { hasRecallSearchCriteria, searchOfficialRecalls, type RecallSearchCriteria } from "../../recall-engine";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const criteria: RecallSearchCriteria = {
    query: searchParams.get("q") || "",
    product: searchParams.get("product") || "",
    brand: searchParams.get("brand") || "",
    category: searchParams.get("category") || "",
    barcode: searchParams.get("barcode") || "",
    lot: searchParams.get("lot") || "",
    date: searchParams.get("date") || "",
  };

  if (!hasRecallSearchCriteria(criteria)) {
    return Response.json({ error: "Enter a product, brand, category, barcode, lot/code, or package date." }, { status: 400 });
  }

  const result = await searchOfficialRecalls(criteria);
  if (result.sources.every((source) => source.status === "unavailable")) {
    return Response.json({ ...result, error: "The FDA and USDA-FSIS recall feeds could not be reached." }, { status: 502 });
  }

  return Response.json(result);
}
