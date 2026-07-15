import { lookupOpenFoodFactsBarcode } from "../../open-food-facts";
import { normalizeGtin } from "../../barcode.ts";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const barcode = normalizeGtin(searchParams.get("barcode") || "");

  if (!barcode) {
    return Response.json({ error: "Enter a valid UPC, EAN, or GTIN with its check digit." }, { status: 400 });
  }

  const result = await lookupOpenFoodFactsBarcode(barcode);
  const status = result.status === "error" ? 502 : 200;
  return Response.json(result, { status });
}
