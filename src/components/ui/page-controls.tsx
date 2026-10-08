import Link from "next/link";

export function PageControls({ page, hasPrevious, hasNext, hrefForPage, label = "Page" }: {
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
  hrefForPage: (page: number) => string;
  label?: string;
}) {
  if (!hasPrevious && !hasNext) return null;
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--betanor-border)] px-4 py-3 sm:px-5">
    <span className="text-xs text-[var(--betanor-muted)]">{label} {page}</span>
    <div className="flex gap-2">
      {hasPrevious ? <Link href={hrefForPage(page - 1)} prefetch={false} className="inline-flex min-h-9 items-center rounded-lg border border-[var(--betanor-border)] px-3 text-xs font-semibold text-[var(--betanor-blue)] hover:bg-slate-50">Previous</Link> : null}
      {hasNext ? <Link href={hrefForPage(page + 1)} prefetch={false} className="inline-flex min-h-9 items-center rounded-lg border border-[var(--betanor-border)] px-3 text-xs font-semibold text-[var(--betanor-blue)] hover:bg-slate-50">Next</Link> : null}
    </div>
  </nav>;
}
