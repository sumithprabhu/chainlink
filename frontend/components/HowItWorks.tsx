"use client";

import { motion } from "framer-motion";
import { Wallet, PenLine, Cpu, CheckCircle } from "lucide-react";

const steps = [
  { icon: Wallet, title: "Deposit", description: "Lock escrow on-chain via depositBid. Escrow must be ≥ your confidential bid." },
  { icon: PenLine, title: "Sign", description: "Sign EIP-712 (workflowId, bidAmount, confidentialBidAmount). Submit to the engine." },
  { icon: Cpu, title: "Confidential Compute", description: "CRA evaluates bids privately. Winner and commitment are determined off-chain." },
  { icon: CheckCircle, title: "On-Chain Settlement", description: "Engine finalizes with commitment; contract releases escrow to winner, refunds others." },
];

export function HowItWorks() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-3xl font-bold text-white md:text-4xl">
          How It Works
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
          Four steps from deposit to settlement.
        </p>
        <div className="mt-16">
          <div className="relative">
            <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-white/10 md:block" />
            <ul className="space-y-12 md:space-y-0">
              {steps.map((step, i) => (
                <motion.li
                  key={step.title}
                  initial={{ opacity: 0, y: -32 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px 0px -40px 0px" }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="relative flex flex-col items-center md:flex-row md:odd:flex-row-reverse"
                >
                  <div className="flex flex-1 items-center md:px-12">
                    <div className="rounded-xl border border-white/10 bg-card/80 p-6 text-center md:text-left">
                      <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20 text-primary">
                        <step.icon className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 text-lg font-semibold text-white">{step.title}</h3>
                      <p className="mt-2 text-sm text-muted">{step.description}</p>
                    </div>
                  </div>
                  <div className="absolute left-1/2 mt-6 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border-2 border-primary bg-dark text-sm font-bold text-primary md:mt-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 md:px-12" />
                </motion.li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
