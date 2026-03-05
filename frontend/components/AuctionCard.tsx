"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatEth } from "@/lib/utils";
import type { AuctionSummary } from "@/lib/types";

export function AuctionCard({ auction }: { auction: AuctionSummary }) {
  const statusLabel =
    auction.status === "closed"
      ? "Closed"
      : auction.status === "ending_soon"
        ? "Ending Soon"
        : "Active";
  const statusColor =
    auction.status === "closed"
      ? "text-muted"
      : auction.status === "ending_soon"
        ? "text-amber-400"
        : "text-success";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="overflow-hidden transition-all hover:border-primary/30 hover:shadow-glow-sm">
        <CardContent className="p-0">
          <Link href={`/auction/${auction.workflowId}`} className="block p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm text-muted">Auction #{auction.workflowId}</p>
                <p className={`mt-1 text-sm font-medium ${statusColor}`}>{statusLabel}</p>
              </div>
              <div className="text-right text-sm text-muted">
                <p>Bidders: {auction.bidderCount.toString()}</p>
                {auction.reservePrice !== undefined && (
                  <p>Reserve: {formatEth(auction.reservePrice)} ETH</p>
                )}
              </div>
            </div>
            {auction.dynamicEndTime && (
              <p className="mt-2 text-xs text-muted">
                Ends: {new Date(Number(auction.dynamicEndTime) * 1000).toLocaleString()}
              </p>
            )}
          </Link>
          <div className="border-t border-white/10 px-6 py-3">
            <Link href={`/auction/${auction.workflowId}`}>
              <Button variant="secondary" size="sm" className="w-full">
                View Auction
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
