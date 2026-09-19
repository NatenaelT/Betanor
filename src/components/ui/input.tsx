import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 text-sm text-[var(--betanor-field-text)] outline-none placeholder:text-[var(--betanor-muted)] focus:border-[var(--betanor-field-focus)] focus:ring-2 focus:ring-blue-100 disabled:bg-[var(--betanor-surface)] disabled:text-[var(--betanor-muted)]", className)} {...props} />;
}

export function FieldLabel({ className, required, children, ...props }: LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return <label className={cn("mb-1.5 block text-sm font-semibold text-[var(--betanor-header-text)]", className)} data-required={required ? "true" : undefined} {...props}>{children}{required ? <span aria-hidden="true" className="ml-1 text-[var(--betanor-danger)]">*</span> : null}</label>;
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-xs leading-5 text-[var(--betanor-muted)]">{children}</p>;
}
