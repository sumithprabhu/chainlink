"use client";

import { motion } from "framer-motion";
import { Shield, Cpu, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Shield,
    title: "Fully Collateralized Bids",
    description:
      "Escrow must cover your confidential bid. No post-settlement payments; contract releases only what is escrowed.",
  },
  {
    icon: Cpu,
    title: "Confidential Compute (Powered by Chainlink)",
    description:
      "Bid values are evaluated off-chain in a confidential environment. Only the winner and commitment are revealed on-chain.",
  },
  {
    icon: Zap,
    title: "Automatic Settlement",
    description:
      "Auctions close automatically after the end time. Settlement and escrow release are enforced by the contract.",
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function FeatureGrid() {
  return (
    <motion.section
      variants={container}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className="py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold text-white md:text-4xl">
          Why SEAL
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
          Secure Escrow Auction Layer: trust-minimized, escrow-backed, and settlement-enforced.
        </p>
        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {features.map((feature) => (
            <motion.div key={feature.title} variants={item}>
              <Card className="h-full border-white/10 bg-card/80 backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-glow-sm">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm text-muted">{feature.description}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}
