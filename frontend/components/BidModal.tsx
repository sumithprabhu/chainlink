"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface BidModalProps {
  open: boolean;
  onClose: () => void;
  workflowId: number;
  onSubmit: (params: { bidAmountWei: bigint; confidentialBidAmount: string }) => Promise<void>;
  disabled?: boolean;
  userEscrowWei: bigint;
}

export function BidModal({
  open,
  onClose,
  workflowId,
  onSubmit,
  disabled,
  userEscrowWei,
}: BidModalProps) {
  const [bidAmountEth, setBidAmountEth] = useState("");
  const [confidentialEth, setConfidentialEth] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const bidAmountWei = BigInt(Math.floor(parseFloat(bidAmountEth || "0") * 1e18));
    const confidentialBidAmount = confidentialEth.trim() || "0";
    if (bidAmountWei <= 0n) {
      setError("Escrow amount must be positive.");
      return;
    }
    const confidentialWei = BigInt(Math.floor(parseFloat(confidentialBidAmount || "0") * 1e18));
    if (userEscrowWei + bidAmountWei < confidentialWei) {
      setError("Total escrow must be ≥ confidential bid amount (fully collateralized).");
      return;
    }
    setLoading(true);
    try {
      await onSubmit({ bidAmountWei, confidentialBidAmount });
      onClose();
      setBidAmountEth("");
      setConfidentialEth("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-white/10 bg-card p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Submit Bid — Auction #{workflowId}</h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-muted hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="bidAmount">Escrow amount (ETH)</Label>
                <Input
                  id="bidAmount"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.0"
                  value={bidAmountEth}
                  onChange={(e) => setBidAmountEth(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="confidential">Confidential bid amount (ETH)</Label>
                <Input
                  id="confidential"
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0.0"
                  value={confidentialEth}
                  onChange={(e) => setConfidentialEth(e.target.value)}
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-muted">
                  Must be ≤ total escrow (current + deposit).
                </p>
              </div>
              {error && (
                <p className="text-sm text-error">{error}</p>
              )}
              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
                  Cancel
                </Button>
                <Button type="submit" disabled={disabled || loading} className="flex-1">
                  {loading ? "Submitting..." : "Submit Bid"}
                </Button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
