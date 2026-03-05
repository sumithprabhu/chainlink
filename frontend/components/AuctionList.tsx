"use client";

import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { CONFIDENTIAL_ENGINE_ABI } from "@/lib/contract";
import { AuctionCard } from "@/components/AuctionCard";
import type { AuctionSummary } from "@/lib/types";

function getContractAddress(): `0x${string}` | null {
  const addr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!addr || !addr.startsWith("0x")) return null;
  return addr as `0x${string}`;
}

export function AuctionList() {
  const address = getContractAddress();
  const publicClient = usePublicClient();

  const { data: nextId, isLoading: loadingNext } = useQuery({
    queryKey: ["nextWorkflowId", address ?? ""],
    queryFn: async () => {
      if (!publicClient || !address) return BigInt(0);
      return await publicClient.readContract({
        address,
        abi: CONFIDENTIAL_ENGINE_ABI,
        functionName: "nextWorkflowId",
      });
    },
    enabled: !!publicClient && !!address,
  });

  const workflowIds = nextId != null && nextId > BigInt(0)
    ? Array.from({ length: Number(nextId) - 1 }, (_, i) => i + 1)
    : [];

  const { data: auctions, isLoading } = useQuery({
    queryKey: ["auctions", address, workflowIds.join(",")],
    queryFn: async (): Promise<AuctionSummary[]> => {
      if (!publicClient || !address || workflowIds.length === 0) return [];
      const results: AuctionSummary[] = [];
      for (const wid of workflowIds) {
        try {
          const [config, auctionConfig, bidderCount, executionCount, escrowReleased, dynamicEndTime] =
            await Promise.all([
              publicClient.readContract({
                address,
                abi: CONFIDENTIAL_ENGINE_ABI,
                functionName: "getWorkflowConfig",
                args: [BigInt(wid)],
              }),
              publicClient.readContract({
                address,
                abi: CONFIDENTIAL_ENGINE_ABI,
                functionName: "getAuctionConfig",
                args: [BigInt(wid)],
              }),
              publicClient.readContract({
                address,
                abi: CONFIDENTIAL_ENGINE_ABI,
                functionName: "getBidderCount",
                args: [BigInt(wid)],
              }),
              publicClient.readContract({
                address,
                abi: CONFIDENTIAL_ENGINE_ABI,
                functionName: "getExecutionCount",
                args: [BigInt(wid)],
              }),
              publicClient.readContract({
                address,
                abi: CONFIDENTIAL_ENGINE_ABI,
                functionName: "escrowReleased",
                args: [BigInt(wid)],
              }),
              publicClient.readContract({
                address,
                abi: CONFIDENTIAL_ENGINE_ABI,
                functionName: "dynamicEndTime",
                args: [BigInt(wid)],
              }),
            ]);
          if (config.moduleType !== 0) continue; // only sealed-bid auctions
          const startTime = (auctionConfig as { startTime: bigint }).startTime;
          const dynamicEnd = startTime !== 0n ? (dynamicEndTime as bigint) : 0n;
          const now = BigInt(Math.floor(Date.now() / 1000));
          let status: "active" | "ending_soon" | "closed" = "active";
          if (executionCount > 0n || escrowReleased) status = "closed";
          else if (dynamicEnd > 0n && now >= dynamicEnd) status = "closed";
          else if (dynamicEnd > 0n && now >= dynamicEnd - 300n) status = "ending_soon";
          results.push({
            workflowId: String(wid),
            status,
            bidderCount,
            reservePrice: (auctionConfig as { reservePrice: bigint }).reservePrice,
            dynamicEndTime: dynamicEnd > 0n ? dynamicEnd : undefined,
          });
        } catch {
          // skip invalid or non-auction workflows
        }
      }
      return results.reverse();
    },
    enabled: !!publicClient && !!address && workflowIds.length > 0,
  });

  if (!address) {
    return (
      <p className="mt-12 text-center text-muted">
        Set NEXT_PUBLIC_CONTRACT_ADDRESS to view auctions.
      </p>
    );
  }

  if (loadingNext || isLoading) {
    return (
      <div className="mt-12 flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!auctions?.length) {
    return (
      <p className="mt-12 text-center text-muted">No auctions yet. Create one to get started.</p>
    );
  }

  return (
    <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {auctions.map((auction) => (
        <AuctionCard key={auction.workflowId} auction={auction} />
      ))}
    </div>
  );
}
