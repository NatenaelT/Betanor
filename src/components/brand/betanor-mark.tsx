import type { HTMLAttributes } from "react";

export function BetanorMark({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className} {...props}>
      <span className="grid size-9 place-items-center rounded-lg bg-[var(--betanor-navy)] text-lg font-bold text-white shadow-sm">
        B
      </span>
      <span className="leading-none">
        <span className="block text-sm font-bold tracking-[0.14em] text-[var(--betanor-navy)]">
          BETANOR
        </span>
        <span className="block pt-1 text-[10px] font-medium tracking-[0.12em] text-[var(--betanor-muted)]">
          TECHNOLOGY SOLUTIONS
        </span>
      </span>
    </div>
  );
}
