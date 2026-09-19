"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function Modal({ title, children, onClose, className = "" }: { title: string; children: ReactNode; onClose: () => void; className?: string }) {
  return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[80] flex items-center justify-center bg-[rgba(11,31,58,0.48)] p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--betanor-border)] bg-white shadow-2xl ${className}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-[var(--betanor-border)] bg-white px-5 py-4">
        <h2 className="text-lg font-semibold text-[var(--betanor-navy)]">{title}</h2>
        <Button type="button" variant="ghost" size="sm" aria-label="Close dialog" onClick={onClose}>×</Button>
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </div>
  </div>;
}
