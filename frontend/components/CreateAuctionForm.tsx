"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CREATION_DEPOSIT_ETH, CREATION_FEE_ETH } from "@/lib/utils";

export interface CreateAuctionFormProps {
  onCreate: (params: {
    startTime: number;
    endTime: number;
    reservePrice: bigint;
    minBidIncrement: bigint;
    maxBidders: bigint;
    softCloseEnabled: boolean;
    softCloseWindow: bigint;
    softCloseExtension: bigint;
  }) => Promise<number>;
  disabled?: boolean;
}

export function CreateAuctionForm({ onCreate, disabled }: CreateAuctionFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reservePrice, setReservePrice] = useState("");
  const [minBidIncrement, setMinBidIncrement] = useState("");
  const [maxBidders, setMaxBidders] = useState("");
  const [softCloseEnabled, setSoftCloseEnabled] = useState(false);
  const [softCloseWindow, setSoftCloseWindow] = useState("");
  const [softCloseExtension, setSoftCloseExtension] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const start = Math.floor(new Date(startTime).getTime() / 1000);
    const end = Math.floor(new Date(endTime).getTime() / 1000);
    if (!startTime || !endTime || end <= start) {
      setError("End time must be after start time.");
      return;
    }
    const maxB = parseInt(maxBidders, 10);
    if (Number.isNaN(maxB) || maxB < 1) {
      setError("Max bidders must be at least 1.");
      return;
    }
    setLoading(true);
    try {
      const workflowId = await onCreate({
        startTime: start,
        endTime: end,
        reservePrice: BigInt(Math.floor(parseFloat(reservePrice || "0") * 1e18)),
        minBidIncrement: BigInt(Math.floor(parseFloat(minBidIncrement || "0") * 1e18)),
        maxBidders: BigInt(maxB),
        softCloseEnabled,
        softCloseWindow: BigInt(softCloseWindow || "0"),
        softCloseExtension: BigInt(softCloseExtension || "0"),
      });
      router.push(`/auction/${workflowId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>New Auction</CardTitle>
        <CardDescription>
          Set auction window, reserve, and bidders. Creation requires a one-time deposit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="startTime">Start Time</Label>
              <Input
                id="startTime"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="endTime">End Time</Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="reservePrice">Reserve Price (ETH)</Label>
              <Input
                id="reservePrice"
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={reservePrice}
                onChange={(e) => setReservePrice(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="minBidIncrement">Min Bid Increment (ETH)</Label>
              <Input
                id="minBidIncrement"
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={minBidIncrement}
                onChange={(e) => setMinBidIncrement(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="maxBidders">Max Bidders</Label>
            <Input
              id="maxBidders"
              type="number"
              min="1"
              placeholder="10"
              value={maxBidders}
              onChange={(e) => setMaxBidders(e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/10 p-4">
            <div>
              <Label>Soft Close</Label>
              <p className="text-xs text-muted">Extend end time when bids near closing</p>
            </div>
            <Switch checked={softCloseEnabled} onCheckedChange={setSoftCloseEnabled} />
          </div>
          {softCloseEnabled && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="softCloseWindow">Soft Close Window (seconds)</Label>
                <Input
                  id="softCloseWindow"
                  type="number"
                  min="0"
                  value={softCloseWindow}
                  onChange={(e) => setSoftCloseWindow(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="softCloseExtension">Soft Close Extension (seconds)</Label>
                <Input
                  id="softCloseExtension"
                  type="number"
                  min="0"
                  value={softCloseExtension}
                  onChange={(e) => setSoftCloseExtension(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          )}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm text-muted">
              Creation Deposit: {CREATION_DEPOSIT_ETH} ETH ({CREATION_FEE_ETH} ETH protocol fee)
            </p>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" disabled={disabled || loading} className="w-full">
            {loading ? "Creating..." : "Create Auction"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
