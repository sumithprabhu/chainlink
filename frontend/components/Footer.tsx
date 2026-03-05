"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

const links = [
  { href: "/docs", label: "Docs" },
  { href: "/create", label: "Create" },
  { href: "https://github.com", label: "GitHub", external: true },
];

export function Footer() {
  return (
    <motion.footer
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="border-t border-white/10 bg-dark mt-24"
    >
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="SEAL" width={24} height={24} className="h-6 w-6 object-contain" />
            <p className="text-sm text-muted">
              SEAL: Secure Escrow Auction Layer · Fully Collateralized · On-Chain Enforced
            </p>
          </div>
          <nav className="flex gap-8">
            {links.map((link) =>
              link.external ? (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted hover:text-white transition-colors"
                >
                  {link.label}
                </a>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-muted hover:text-white transition-colors"
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>
        </div>
      </div>
    </motion.footer>
  );
}
