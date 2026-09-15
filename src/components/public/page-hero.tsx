import type { ReactNode } from "react";

export function PageHero({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <section className="border-b border-[var(--betanor-border)] bg-[var(--betanor-dark-navy)] px-6 py-18 text-white lg:px-8">
    <div className="mx-auto max-w-7xl">
      <p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-light-gold)] uppercase">{eyebrow}</p>
      <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      <div className="mt-5 max-w-3xl text-base leading-7 text-slate-300">{children}</div>
    </div>
  </section>;
}
