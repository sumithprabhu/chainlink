import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatEth(wei: bigint): string {
  const eth = Number(wei) / 1e18;
  return eth.toFixed(4);
}

export function parseEth(eth: string): bigint {
  const parsed = parseFloat(eth);
  if (Number.isNaN(parsed) || parsed < 0) return 0n;
  return BigInt(Math.floor(parsed * 1e18));
}

export const CREATION_DEPOSIT_ETH = "0.001";
export const CREATION_FEE_ETH = "0.0001";
export const CREATION_DEPOSIT_WEI = BigInt("1000000000000000"); // 0.001 ether
