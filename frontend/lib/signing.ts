import { type WalletClient } from "viem";

export const BID_DOMAIN = {
  name: "ConfidentialAuction",
  version: "1",
} as const;

export const BID_TYPES = {
  Bid: [
    { name: "workflowId", type: "uint256" },
    { name: "bidAmount", type: "uint256" },
    { name: "confidentialBidAmount", type: "string" },
  ],
} as const;

export async function signBid(
  walletClient: WalletClient,
  chainId: number,
  verifyingContract: `0x${string}`,
  workflowId: bigint,
  bidAmount: bigint,
  confidentialBidAmount: string
): Promise<`0x${string}`> {
  if (!walletClient?.account?.address) throw new Error("Wallet not connected");
  const signature = await walletClient.signTypedData({
    account: walletClient.account.address,
    domain: { ...BID_DOMAIN, chainId, verifyingContract },
    types: BID_TYPES,
    primaryType: "Bid",
    message: {
      workflowId,
      bidAmount,
      confidentialBidAmount,
    },
  });
  return signature;
}
