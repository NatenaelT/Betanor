"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  return <div role="dialog" aria-modal="true" aria-label={title} className="mobile-modal-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(11,31,58,0.48)] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`mobile-modal-content max-h-[calc(100dvh-env(safe-area-inset-top))] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-[var(--betanor-border)] bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl ${className}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--betanor-border)] bg-white px-5 py-4">
        <h2 className="text-lg font-semibold text-[var(--betanor-navy)]">{title}</h2>
        <Button type="button" variant="ghost" size="sm" aria-label="Close dialog" onClick={onClose}>×</Button>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  </div>;
}
