"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Drawer({ children, isOpen, onClose, title }: { children: ReactNode; isOpen: boolean; onClose: () => void; title: string }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  return (
    <div className={cn("fixed inset-0 z-50 lg:hidden", !isOpen && "pointer-events-none")} aria-hidden={!isOpen}>
      <button aria-label="Close navigation" className={cn("absolute inset-0 bg-[var(--betanor-dark-navy)]/45 transition-opacity", isOpen ? "opacity-100" : "opacity-0")} onClick={onClose} tabIndex={isOpen ? 0 : -1} />
      <aside aria-label={title} aria-modal="true" className={cn("relative h-full w-80 max-w-[88vw] bg-[var(--betanor-dark-navy)] shadow-2xl transition-transform", isOpen ? "translate-x-0" : "-translate-x-full")} role="dialog">
        {children}
      </aside>
    </div>
  );
}
