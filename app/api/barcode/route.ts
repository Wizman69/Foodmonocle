import { lookupOpenFoodFactsBarcode } from "../../open-food-facts";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get("barcode") || "";

  if (barcode.replace(/\D/g, "").length < 8) {
    return Response.json({ error: "Enter at least 8 barcode digits." }, { status: 400 });
  }

  const result = await lookupOpenFoodFactsBarcode(barcode);
  const status = result.status === "error" ? 502 : 200;
  return Response.json(result, { status });
}
