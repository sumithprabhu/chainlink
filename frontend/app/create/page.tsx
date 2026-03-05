"use client";

import { useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient } from "wagmi";
import { CreateAuctionForm } from "@/components/CreateAuctionForm";
import { CONFIDENTIAL_ENGINE_ABI, MODULE_TYPE_SEALED_BID_AUCTION, SETTLEMENT_MODE_ESCROW } from "@/lib/contract";
import { CREATION_DEPOSIT_WEI } from "@/lib/utils";
import { keccak256, stringToHex } from "viem";

const APPROVED_HASH = keccak256(stringToHex("confidential-auction-v1"));

function getContractAddress(): `0x${string}` {
  const addr = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
  if (!addr || !addr.startsWith("0x")) throw new Error("NEXT_PUBLIC_CONTRACT_ADDRESS not set");
  return addr as `0x${string}`;
}

export default function CreatePage() {
  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const onCreate = useCallback(
    async (params: {
      startTime: number;
      endTime: number;
      reservePrice: bigint;
      minBidIncrement: bigint;
      maxBidders: bigint;
      softCloseEnabled: boolean;
      softCloseWindow: bigint;
      softCloseExtension: bigint;
    }) => {
      if (!walletClient?.account?.address) throw new Error("Connect wallet first");
      const address = getContractAddress();
      const hash = await walletClient.writeContract({
        address,
        abi: CONFIDENTIAL_ENGINE_ABI,
        functionName: "createWorkflow",
        args: [
          APPROVED_HASH,
          MODULE_TYPE_SEALED_BID_AUCTION,
          SETTLEMENT_MODE_ESCROW,
          0n,
          {
            startTime: BigInt(params.startTime),
            endTime: BigInt(params.endTime),
            minBidIncrement: params.minBidIncrement,
            reservePrice: params.reservePrice,
            maxBidders: params.maxBidders,
            softCloseEnabled: params.softCloseEnabled,
            softCloseWindow: params.softCloseWindow,
            softCloseExtension: params.softCloseExtension,
          },
        ],
        value: CREATION_DEPOSIT_WEI,
      });
      if (!publicClient) throw new Error("Cannot wait for confirmation");
      await publicClient.waitForTransactionReceipt({ hash });
      const nextId = await publicClient.readContract({
        address,
        abi: CONFIDENTIAL_ENGINE_ABI,
        functionName: "nextWorkflowId",
      });
      const workflowId = nextId != null ? Number(nextId) - 1 : 0;
      if (workflowId < 0) throw new Error("Failed to get new workflow ID");
      return workflowId;
    },
    [walletClient, publicClient]
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-white">Create Auction</h1>
      <p className="mt-2 text-muted">Configure and deploy a new confidential sealed-bid auction.</p>
      <div className="mt-12">
        {!isConnected ? (
          <p className="rounded-xl border border-white/10 bg-card p-6 text-muted">
            Connect your wallet to create an auction.
          </p>
        ) : (
          <CreateAuctionForm onCreate={onCreate} />
        )}
      </div>
    </div>
  );
}
