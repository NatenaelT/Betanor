import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "draft";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-blue-50 text-[var(--betanor-blue)]",
  success: "bg-emerald-50 text-[var(--betanor-success)]",
  warning: "bg-amber-50 text-[var(--betanor-warning)]",
  danger: "bg-rose-50 text-[var(--betanor-danger)]",
  draft: "bg-[var(--betanor-light-gold)] text-[var(--betanor-dark-navy)]",
};

export function Badge({ className, tone = "neutral", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)} {...props} />;
}
