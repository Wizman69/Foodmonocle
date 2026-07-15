type OpenFdaRecall = {
  recall_number?: string;
  product_description?: string;
  reason_for_recall?: string;
  recalling_firm?: string;
  classification?: string;
  status?: string;
  report_date?: string;
  distribution_pattern?: string;
};

function cleanQuery(value: string) {
  return value.replace(/[^a-zA-Z0-9 '&().,-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = cleanQuery(searchParams.get("q") || "");

  if (query.length < 2) {
    return Response.json({ error: "Enter a product or company name." }, { status: 400 });
  }

  const params = new URLSearchParams({
    search: `product_description:"${query}"`,
    sort: "report_date:desc",
    limit: "6",
  });

  try {
    const response = await fetch(`https://api.fda.gov/food/enforcement.json?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 404) {
      return Response.json({ results: [], checkedAt: new Date().toISOString() });
    }
    if (!response.ok) {
      return Response.json({ error: "The FDA recall feed is temporarily unavailable." }, { status: 502 });
    }

    const data = (await response.json()) as { results?: OpenFdaRecall[] };
    const results = (data.results || []).map((item) => ({
      id: item.recall_number || `${item.recalling_firm}-${item.report_date}`,
      product: item.product_description || "Product description unavailable",
      reason: item.reason_for_recall || "Reason unavailable",
      company: item.recalling_firm || "Company unavailable",
      classification: item.classification || "Not classified",
      status: item.status || "Status unavailable",
      date: item.report_date || "",
      distribution: item.distribution_pattern || "Distribution details unavailable",
    }));

    return Response.json({ results, checkedAt: new Date().toISOString() });
  } catch {
    return Response.json({ error: "The FDA recall feed could not be reached." }, { status: 502 });
  }
}
