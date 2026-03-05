"use client";

import { motion } from "framer-motion";
import { Check } from "lucide-react";

const features = [
  "Permissionless creation: anyone can create an auction with the creation deposit.",
  "Escrow enforcement: contract only releases escrowed funds; no post-settlement payments.",
  "Winner authenticity bound via commitment: winnerHash in commitment; contract validates before release.",
  "Automatic closing: configured auctions close after dynamic end time; engine triggers settlement.",
];

export function ProtocolFeatures() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px 0px -60px 0px" }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            Protocol Features
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted">
            Security and fairness by design.
          </p>
        </motion.div>
        <motion.ul
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-40px 0px -40px 0px" }}
          variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          className="mx-auto mt-12 max-w-2xl space-y-4"
        >
          {features.map((text) => (
            <motion.li
              key={text}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-card/50 px-4 py-3"
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success/20 text-success">
                <Check className="h-3 w-3" />
              </span>
              <span className="text-sm text-muted">{text}</span>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
