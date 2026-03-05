"use client";

import { Hero } from "@/components/Hero";
import { FeatureGrid } from "@/components/FeatureGrid";
import { HowItWorks } from "@/components/HowItWorks";
import { ProtocolFeatures } from "@/components/ProtocolFeatures";
import { AuctionList } from "@/components/AuctionList";

export default function Home() {
  return (
    <>
      <Hero />
      <section className="border-t border-white/5">
        <FeatureGrid />
        <HowItWorks />
        <section id="auctions" className="scroll-mt-24 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-center text-3xl font-bold text-white md:text-4xl">
              Auctions
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-muted">
              Browse and participate in active auctions.
            </p>
            <AuctionList />
          </div>
        </section>
        <ProtocolFeatures />
      </section>
    </>
  );
}
