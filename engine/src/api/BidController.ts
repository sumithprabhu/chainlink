/**
 * Bid and auction close API. No plaintext bid stored or logged.
 * Bids require EIP-712 signature; recovered signer must equal bidderAddress.
 */
import { verifyTypedData } from "ethers";
import { Router, type Request, type Response } from "express";
import type { AuctionService } from "../services/AuctionService";
import type { Logger } from "pino";

const BID_DOMAIN = {
  name: "ConfidentialAuction",
  version: "1",
} as const;

const BID_TYPES = {
  Bid: [
    { name: "workflowId", type: "uint256" },
    { name: "bidAmount", type: "uint256" },
    { name: "confidentialBidAmount", type: "string" },
  ],
};

export interface BidRouterOptions {
  chainId: number;
  verifyingContract: string;
}

export function createBidRouter(
  auction: AuctionService,
  logger: Logger,
  options: BidRouterOptions
): Router {
  const router = Router();
  const log = logger.child({ api: "BidController" });
  const domain = {
    ...BID_DOMAIN,
    chainId: options.chainId,
    verifyingContract: options.verifyingContract,
  };

  router.post("/bid", async (req: Request, res: Response) => {
    try {
      const { workflowId, bidAmount, confidentialBidAmount, bidderAddress, signature } = req.body as {
        workflowId?: number;
        bidAmount?: string;
        confidentialBidAmount?: string;
        bidderAddress?: string;
        signature?: string;
      };
      if (
        typeof workflowId !== "number" ||
        typeof bidAmount !== "string" ||
        typeof confidentialBidAmount !== "string" ||
        typeof bidderAddress !== "string" ||
        typeof signature !== "string"
      ) {
        res.status(400).json({
          error: "Missing or invalid workflowId, bidAmount, confidentialBidAmount, bidderAddress, signature",
        });
        return;
      }
      let bidAmountWei: bigint;
      try {
        bidAmountWei = BigInt(bidAmount);
      } catch {
        res.status(400).json({ error: "bidAmount must be a valid integer (wei)" });
        return;
      }
      const value = {
        workflowId: BigInt(workflowId),
        bidAmount: bidAmountWei,
        confidentialBidAmount,
      };
      let recovered: string;
      try {
        recovered = verifyTypedData(domain, BID_TYPES, value, signature);
      } catch {
        res.status(400).json({ error: "Invalid signature" });
        return;
      }
      if (recovered.toLowerCase() !== bidderAddress.toLowerCase()) {
        res.status(400).json({ error: "Signature signer does not match bidderAddress" });
        return;
      }
      await auction.submitBid(workflowId, bidAmountWei, confidentialBidAmount, bidderAddress);
      log.info({ workflowId, bidderAddress }, "Bid accepted");
      res.status(200).json({ status: "accepted" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ error: msg }, "Bid rejected");
      res.status(400).json({ error: msg });
    }
  });

  router.post("/close-auction", async (req: Request, res: Response) => {
    try {
      const { workflowId, winnerAddress } = req.body as { workflowId?: number; winnerAddress?: string };
      if (typeof workflowId !== "number") {
        res.status(400).json({ error: "Missing or invalid workflowId" });
        return;
      }
      const { commitmentHash } = await auction.closeAuction(workflowId, {
        winnerAddress: typeof winnerAddress === "string" ? winnerAddress : undefined,
      });
      log.info({ workflowId, commitmentHash }, "Auction closed");
      res.status(200).json({ status: "closed", commitmentHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.warn({ error: msg }, "Close auction failed");
      res.status(400).json({ error: msg });
    }
  });

  return router;
}
