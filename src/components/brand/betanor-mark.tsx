import Image from "next/image";
import type { HTMLAttributes } from "react";

import { BETANOR_LOGO_DATA_URI } from "@/lib/brand-assets";
import { cn } from "@/lib/utils";

export function BetanorMark({ className, dark = false, ...props }: HTMLAttributes<HTMLDivElement> & { dark?: boolean }) {
  return (
    <div className={className} {...props}>
      <Image alt="Betanor" className="size-11 rounded-lg object-contain" height={64} priority src={BETANOR_LOGO_DATA_URI} unoptimized width={64} />
      <span className="leading-none">
        <span className={cn("block text-sm font-bold tracking-[0.14em]", dark ? "text-white" : "text-[var(--betanor-navy)]")}>
          BETANOR
        </span>
        <span className={cn("block pt-1 text-[10px] font-medium tracking-[0.06em]", dark ? "text-slate-400" : "text-[var(--betanor-muted)]")}>
          ALWAYS WELCOME, ALWAYS READY.
        </span>
      </span>
    </div>
  );
}
