import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-[var(--betanor-navy)] text-white hover:bg-[var(--betanor-blue)] focus-visible:outline-[var(--betanor-electric-blue)]",
  secondary: "bg-[var(--betanor-gold)] text-[var(--betanor-dark-navy)] hover:bg-[#b7871f] focus-visible:outline-[var(--betanor-gold)]",
  outline: "border border-[var(--betanor-border)] bg-white text-[var(--betanor-navy)] hover:border-[var(--betanor-blue)] hover:bg-slate-50 focus-visible:outline-[var(--betanor-electric-blue)]",
  danger: "bg-[var(--betanor-danger)] text-white hover:bg-[#9d1f2f] focus-visible:outline-[var(--betanor-danger)]",
  ghost: "text-[var(--betanor-navy)] hover:bg-slate-100 focus-visible:outline-[var(--betanor-electric-blue)]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-xs",
  md: "min-h-10 px-4 text-sm",
  lg: "min-h-12 px-5 text-base",
};

export function Button({ className, size = "md", variant = "primary", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: ButtonSize; variant?: ButtonVariant }) {
  return <button className={cn("inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50", variants[variant], sizes[size], className)} type={type} {...props} />;
}
