"use client";

import { motion } from "framer-motion";

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <motion.article
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="prose prose-invert max-w-none space-y-16"
      >
        <header>
          <h1 className="text-4xl font-bold text-white">Documentation</h1>
          <p className="mt-2 text-lg text-muted">
            Architecture, trust model, and economic design of SEAL: Secure Escrow Auction Layer.
          </p>
        </header>

        <section id="faq">
          <h2 className="text-2xl font-bold text-white">FAQ</h2>
          <dl className="mt-6 space-y-6">
            <div>
              <dt className="text-lg font-medium text-white">What is SEAL?</dt>
              <dd className="mt-2 text-muted">
                <strong>SEAL</strong> stands for <strong>Secure Escrow Auction Layer</strong>. It is a
                protocol for confidential sealed-bid auctions where bids are fully collateralized by
                escrow, evaluated off-chain by confidential compute, and settled on-chain. Only the winner
                and a commitment are revealed; bid amounts stay private.
              </dd>
            </div>
            <div>
              <dt className="text-lg font-medium text-white">Why must escrow cover my bid?</dt>
              <dd className="mt-2 text-muted">
                SEAL requires full collateralization: your on-chain escrow must be at least your
                confidential bid amount. The contract only ever releases escrowed funds, so there is no
                post-settlement payment. This keeps the system secure and trust-minimized.
              </dd>
            </div>
            <div>
              <dt className="text-lg font-medium text-white">Who can create an auction?</dt>
              <dd className="mt-2 text-muted">
                Anyone. SEAL supports permissionless auction creation. Creators pay a one-time creation
                deposit; most of it is refunded when the auction closes successfully, with a small
                protocol fee retained.
              </dd>
            </div>
          </dl>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white">Architecture Overview</h2>
          <p className="mt-4 text-muted">
            The system has three layers: the on-chain contract (Confidential Execution Engine), the off-chain
            engine (Node.js service), and the Confidential Compute (CRA) that evaluates bids in a trusted
            environment. Bidders deposit escrow on-chain and submit signed confidential bid amounts to the
            engine; the engine forwards them to the CRA. After the auction end time, the engine requests
            settlement from the CRA, which returns the winner and a commitment. The engine finalizes the
            execution on-chain and releases escrow to the winner.
          </p>
          <div className="mt-8 flex justify-center">
            <svg
              viewBox="0 0 600 280"
              className="w-full max-w-2xl rounded-xl border border-white/10 bg-card/50 p-6"
              fill="none"
            >
              <rect x="50" y="20" width="120" height="50" rx="8" stroke="#375BD2" strokeWidth="2" />
              <text x="110" y="52" fill="#AAB3C5" textAnchor="middle" fontSize="12">Contract</text>
              <rect x="240" y="20" width="120" height="50" rx="8" stroke="#375BD2" strokeWidth="2" />
              <text x="300" y="52" fill="#AAB3C5" textAnchor="middle" fontSize="12">Engine</text>
              <rect x="430" y="20" width="120" height="50" rx="8" stroke="#375BD2" strokeWidth="2" />
              <text x="490" y="52" fill="#AAB3C5" textAnchor="middle" fontSize="12">CRA</text>
              <path d="M 170 45 L 240 45" stroke="#AAB3C5" strokeWidth="1" markerEnd="url(#arrow)" />
              <path d="M 360 45 L 430 45" stroke="#AAB3C5" strokeWidth="1" markerEnd="url(#arrow)" />
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#AAB3C5" />
                </marker>
              </defs>
              <text x="300" y="100" fill="#FFFFFF" textAnchor="middle" fontSize="14">Flow: Deposit → Sign → CRA → Finalize → Release</text>
            </svg>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white">Trust Model</h2>
          <p className="mt-4 text-muted">
            The smart contract is the source of truth for escrow and payouts. It does not learn bid values;
            it only enforces that the winner has non-zero escrow and that execution has been finalized with
            a valid attestation. The CRA is trusted to compute the winner correctly and to bind the
            winnerHash in the commitment. The engine is trusted to call the contract correctly and to
            forward bids to the CRA without tampering. Bidders must sign EIP-712 messages so the engine
            cannot forge bids.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white">Economic Model</h2>
          <p className="mt-4 text-muted">
            Creation requires a one-time deposit (e.g. 0.001 ETH). A protocol fee (e.g. 0.0001 ETH) is
            retained on successful auction close; the rest is refunded to the creator. This discourages
            spam while funding protocol sustainability. Bidders lock escrow for the duration of the
            auction; only the winner receives their escrowed amount back as payout, and others are
            refunded. No second payment phase exists—everything is fully collateralized.
          </p>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-white">Fully Collateralized Confidential Bidding</h2>
          <p className="mt-4 text-muted">
            Each bidder deposits escrow on-chain (via depositBid) and submits a confidential bid amount to
            the CRA. The engine enforces that escrow ≥ confidential bid amount before accepting the bid.
            At settlement, the engine again verifies that the winner’s escrow is at least their
            confidential bid. The contract only ever releases escrowed funds; it never pays out more than
            what the winner has locked. Thus bid values stay confidential while remaining fully backed by
            collateral.
          </p>
        </section>
      </motion.article>
    </div>
  );
}
