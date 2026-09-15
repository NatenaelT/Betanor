import type { ReactNode } from "react";

export function ContentGrid({ children }: { children: ReactNode }) {
  return <div className="mx-auto grid max-w-7xl gap-5 px-6 py-14 sm:grid-cols-2 lg:grid-cols-3 lg:px-8">{children}</div>;
}

export function ContentCard({ children, title }: { children: ReactNode; title: string }) {
  return <article className="rounded-xl border border-[var(--betanor-border)] bg-white p-6 shadow-[var(--betanor-shadow-card)]"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">{title}</h2><div className="mt-3 text-sm leading-6 text-[var(--betanor-muted)]">{children}</div></article>;
}
