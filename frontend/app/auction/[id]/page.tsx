"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BidModal } from "@/components/BidModal";
import { CONFIDENTIAL_ENGINE_ABI } from "@/lib/contract";
import { submitBid } from "@/lib/api";
import { signBid } from "@/lib/signing";
import { formatEth } from "@/lib/utils";

function getContractAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!addr || !addr.startsWith("0x")) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS not set");
  return addr as `0x${string}`;
}

export default function AuctionPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const workflowId = parseInt(id, 10);
  const [bidModalOpen, setBidModalOpen] = useState(false);

  const { address: userAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const contractAddress = getContractAddress();
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID ?? "11155111", 10);

  const { isLoading: loadingConfig } = useQuery({
    queryKey: ["workflowConfig", contractAddress, workflowId],
    queryFn: () =>
      publicClient!.readContract({
        address: contractAddress,
        abi: CONFIDENTIAL_ENGINE_ABI,
        functionName: "getWorkflowConfig",
        args: [BigInt(workflowId)],
      }),
    enabled: !!publicClient && !Number.isNaN(workflowId) && workflowId >= 0,
  });

  const { data: auctionConfig, isLoading: loadingAuction } = useQuery({
    queryKey: ["auctionConfig", contractAddress, workflowId],
    queryFn: () =>
      publicClient!.readContract({
        address: contractAddress,
        abi: CONFIDENTIAL_ENGINE_ABI,
        functionName: "getAuctionConfig",
        args: [BigInt(workflowId)],
      }),
    enabled: !!publicClient && !Number.isNaN(workflowId) && workflowId >= 0,
  });

  const { data: bidderCount } = useQuery({
    queryKey: ["bidderCount", contractAddress, workflowId],
    queryFn: () =>
      publicClient!.readContract({
        address: contractAddress,
        abi: CONFIDENTIAL_ENGINE_ABI,
        functionName: "getBidderCount",
        args: [BigInt(workflowId)],
      }),
    enabled: !!publicClient && !Number.isNaN(workflowId),
  });

  const { data: userEscrow } = useQuery({
    queryKey: ["escrowedBids", contractAddress, workflowId, userAddress],
    queryFn: () =>
      publicClient!.readContract({
        address: contractAddress,
        abi: CONFIDENTIAL_ENGINE_ABI,
        functionName: "escrowedBids",
        args: [BigInt(workflowId), userAddress!],
      }),
    enabled: !!publicClient && !!userAddress && !Number.isNaN(workflowId),
  });

  const { data: executionCount } = useQuery({
    queryKey: ["executionCount", contractAddress, workflowId],
    queryFn: () =>
      publicClient!.readContract({
        address: contractAddress,
        abi: CONFIDENTIAL_ENGINE_ABI,
        functionName: "getExecutionCount",
        args: [BigInt(workflowId)],
      }),
    enabled: !!publicClient && !Number.isNaN(workflowId),
  });

  const { data: escrowReleased } = useQuery({
    queryKey: ["escrowReleased", contractAddress, workflowId],
    queryFn: () =>
      publicClient!.readContract({
        address: contractAddress,
        abi: CONFIDENTIAL_ENGINE_ABI,
        functionName: "escrowReleased",
        args: [BigInt(workflowId)],
      }),
    enabled: !!publicClient && !Number.isNaN(workflowId),
  });

  const { data: dynamicEndTime } = useQuery({
    queryKey: ["dynamicEndTime", contractAddress, workflowId],
    queryFn: () =>
      publicClient!.readContract({
        address: contractAddress,
        abi: CONFIDENTIAL_ENGINE_ABI,
        functionName: "dynamicEndTime",
        args: [BigInt(workflowId)],
      }),
    enabled: !!publicClient && !Number.isNaN(workflowId),
  });

  const ac = auctionConfig as
    | { startTime: bigint; endTime: bigint; reservePrice: bigint; maxBidders: bigint }
    | undefined;
  const endTime = ac?.startTime !== BigInt(0) && dynamicEndTime != null ? dynamicEndTime : (ac?.endTime ?? BigInt(0));
  const now = BigInt(Math.floor(Date.now() / 1000));
  const [countdown, setCountdown] = useState<string>("");
  useEffect(() => {
    if (endTime <= 0n) return;
    const update = () => {
      const n = BigInt(Math.floor(Date.now() / 1000));
      if (n >= endTime) {
        setCountdown("Ended");
        return;
      }
      const d = endTime - n;
      const h = Number(d / 3600n);
      const m = Number((d % 3600n) / 60n);
      const s = Number(d % 60n);
      setCountdown(`${h}h ${m}m ${s}s`);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [endTime]);

  const status =
    escrowReleased || (executionCount != null && executionCount > 0n)
      ? "Closed"
      : endTime > 0n && now >= endTime
        ? "Ending Soon"
        : "Active";
  const isClosed = status === "Closed";
  const waitingSettlement = endTime > 0n && now >= endTime && !isClosed;

  const handleBidSubmit = async (params: {
    bidAmountWei: bigint;
    confidentialBidAmount: string;
  }) => {
    if (!walletClient?.account?.address || !userAddress) throw new Error("Wallet not connected");
    const signature = await signBid(
      walletClient,
      chainId,
      contractAddress,
      BigInt(workflowId),
      params.bidAmountWei,
      params.confidentialBidAmount
    );
    await submitBid({
      workflowId,
      bidAmount: params.bidAmountWei.toString(),
      confidentialBidAmount: params.confidentialBidAmount,
      bidderAddress: userAddress,
      signature,
    });
  };

  if (Number.isNaN(workflowId) || workflowId < 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16">
        <p className="text-error">Invalid auction ID</p>
      </div>
    );
  }

  if (loadingConfig || loadingAuction) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 flex justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div>
          <h1 className="text-3xl font-bold text-white">Auction #{workflowId}</h1>
          <p className={`mt-1 font-medium ${
            status === "Closed" ? "text-muted" : status === "Ending Soon" ? "text-amber-400" : "text-success"
          }`}>
            {status}
          </p>
        </div>

        {countdown && (
          <Card>
            <CardContent className="py-4">
              <p className="text-muted">Time remaining</p>
              <p className="text-2xl font-bold text-white">{countdown}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Auction Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>Total bidders: {bidderCount?.toString() ?? "—"}</p>
              {ac && (
                <>
                  <p>Reserve: {formatEth(ac.reservePrice)} ETH</p>
                  <p>Max bidders: {ac.maxBidders.toString()}</p>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Your Escrow</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold text-white">
                {userEscrow != null ? formatEth(userEscrow) : "—"} ETH
              </p>
              {isConnected && !isClosed && (
                <Button variant="secondary" size="sm" className="mt-2" onClick={() => setBidModalOpen(true)}>
                  Deposit / Submit Bid
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {waitingSettlement && (
          <Card className="border-amber-500/30">
            <CardContent className="py-6">
              <p className="text-amber-400">Waiting for settlement…</p>
              <p className="mt-1 text-sm text-muted">The auction has ended. Settlement will run automatically.</p>
            </CardContent>
          </Card>
        )}

        {isClosed && (
          <Card>
            <CardContent className="py-6">
              <p className="text-success">Escrow released.</p>
              <p className="mt-1 text-sm text-muted">Winner and payouts have been finalized on-chain.</p>
            </CardContent>
          </Card>
        )}
      </motion.div>

      <BidModal
        open={bidModalOpen}
        onClose={() => setBidModalOpen(false)}
        workflowId={workflowId}
        onSubmit={handleBidSubmit}
        disabled={!isConnected || isClosed}
        userEscrowWei={userEscrow ?? 0n}
      />
    </div>
  );
}
