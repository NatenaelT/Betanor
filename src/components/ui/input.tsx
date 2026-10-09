import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 text-sm text-[var(--betanor-field-text)] outline-none placeholder:text-[var(--betanor-muted)] focus:border-[var(--betanor-field-focus)] focus:ring-2 focus:ring-blue-100 disabled:bg-[var(--betanor-surface)] disabled:text-[var(--betanor-muted)]", className)} {...props} />;
}

export function FieldLabel({ className, required, children, ...props }: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return <div className={cn("relative mb-1.5 flex min-w-0 items-center gap-1", className)}><label className="relative block min-w-0 flex-1 pr-4 text-sm font-semibold text-[var(--betanor-header-text)]" data-required={required ? "true" : undefined} {...props}>{children}{required ? <span aria-hidden="true" className="absolute top-0 right-0 text-[var(--betanor-danger)]">*</span> : null}</label><button type="button" data-field-info-trigger="true" aria-label="Show field information" aria-expanded="false" className="inline-grid size-4 shrink-0 place-items-center rounded-full border border-[var(--betanor-gold)]/70 bg-amber-50 text-[var(--betanor-navy)] transition-colors hover:border-[var(--betanor-blue)] hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--betanor-blue)]"><svg viewBox="0 0 16 16" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="8" cy="8" r="6.1"/><path d="M8 7v4m0-6h.01" strokeLinecap="round"/></svg></button></div>;
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs leading-5 text-[var(--betanor-muted)]">{children}</p>;
}
