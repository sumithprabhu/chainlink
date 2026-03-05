const getApiBase = () => {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_ENGINE_API_URL ?? "";
  }
  return process.env.NEXT_PUBLIC_ENGINE_API_URL ?? "http://localhost:3000";
};

export async function submitBid(params: {
  workflowId: number;
  bidAmount: string;
  confidentialBidAmount: string;
  bidderAddress: string;
  signature: string;
}): Promise<{ status: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Bid failed: ${res.status}`);
  }
  return res.json();
}

export async function closeAuction(params: {
  workflowId: number;
  winnerAddress?: string;
}): Promise<{ status: string; commitmentHash?: string }> {
  const base = getApiBase();
  const res = await fetch(`${base}/close-auction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Close auction failed: ${res.status}`);
  }
  return res.json();
}
