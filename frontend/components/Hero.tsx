"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
      <div className="absolute inset-0 bg-hero-glow pointer-events-none" />
      <div className="absolute inset-0 grid-pattern pointer-events-none opacity-50" />
      <div className="relative mx-auto max-w-7xl flex-1 flex flex-col items-center justify-center text-center">
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
        >
          <span className="text-primary">SEAL</span>
          <br />
          Secure Escrow Auction Layer.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted"
        >
          Fully collateralized, on-chain enforced. Private bid evaluation using confidential compute.
          Escrow-backed settlement secured on Ethereum.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <Link href="/create">
            <Button size="lg" className="min-w-[160px]">
              Create Auction
            </Button>
          </Link>
          <Link href="/#auctions">
            <Button variant="secondary" size="lg" className="min-w-[160px]">
              View Auctions
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
