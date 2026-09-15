import Link from "next/link";

import { BetanorMark } from "@/components/brand/betanor-mark";

export function PublicHeader() {
  return (
    <header className="border-b border-[var(--betanor-border)] bg-white">
      <nav className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-6 px-6 lg:px-8" aria-label="Primary navigation">
        <Link href="/" aria-label="Betanor home">
          <BetanorMark className="flex items-center gap-3" />
        </Link>
        <div className="hidden items-center gap-6 text-sm font-medium text-[var(--betanor-muted)] md:flex">
          <span>Services</span>
          <span>Products</span>
          <span>Solutions</span>
          <span>Insights</span>
          <span>Company</span>
        </div>
        <span className="rounded-md bg-[var(--betanor-navy)] px-4 py-2 text-sm font-semibold text-white">
          Request a Quote
        </span>
      </nav>
    </header>
  );
}
