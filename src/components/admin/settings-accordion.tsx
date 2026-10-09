import type { ReactNode } from "react";

export function SettingsAccordion({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-[var(--betanor-border)] bg-white shadow-sm"
    >
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-4 py-3 transition-colors hover:bg-slate-50/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--betanor-blue)] sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-[var(--betanor-navy)] sm:text-base">
            {title}
          </span>
          {description ? (
            <span className="mt-0.5 block text-xs leading-5 text-[var(--betanor-muted)]">
              {description}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--betanor-border)] text-sm text-[var(--betanor-navy)] transition-transform group-open:rotate-180"
        >
          ⌄
        </span>
      </summary>
      <div className="border-t border-[var(--betanor-border)] p-3 sm:p-5 [&>*:first-child]:!mt-0">
        {children}
      </div>
    </details>
  );
}
