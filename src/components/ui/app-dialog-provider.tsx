"use client";

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

export type ConfirmDialogOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type PromptDialogOptions = {
  title: string;
  description?: string;
  inputLabel: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  validate?: (value: string) => string | null;
};

type DialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  prompt: (options: PromptDialogOptions) => Promise<string | null>;
  toast: (message: string, variant?: "success" | "error" | "info") => void;
};

type PendingDialog =
  | { kind: "confirm"; options: ConfirmDialogOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptDialogOptions; resolve: (value: string | null) => void };

const DialogContext = createContext<DialogContextValue | null>(null);
type ToastNotice = { id: number; message: string; variant: "success" | "error" | "info" };

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<PendingDialog | null>(null);
  const [toastNotice, setToastNotice] = useState<ToastNotice | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [promptError, setPromptError] = useState("");

  const confirm = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>((resolve) => {
    setDialog({ kind: "confirm", options, resolve });
  }), []);

  const prompt = useCallback((options: PromptDialogOptions) => new Promise<string | null>((resolve) => {
    setPromptValue(options.initialValue ?? "");
    setPromptError("");
    setDialog({ kind: "prompt", options, resolve });
  }), []);

  const toast = useCallback((message: string, variant: ToastNotice["variant"] = "success") => {
    setToastNotice({ id: Date.now(), message, variant });
  }, []);

  useEffect(() => {
    if (!toastNotice) return;
    const timer = window.setTimeout(() => setToastNotice(null), toastNotice.variant === "error" ? 7000 : 5000);
    return () => window.clearTimeout(timer);
  }, [toastNotice]);

  const close = useCallback(() => {
    if (!dialog) return;
    if (dialog.kind === "confirm") dialog.resolve(false);
    else dialog.resolve(null);
    setDialog(null);
    setPromptError("");
  }, [dialog]);

  function submitPrompt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.kind !== "prompt") return;
    const value = promptValue.trim();
    const validationError = dialog.options.validate?.(value) ?? null;
    if (validationError) {
      setPromptError(validationError);
      return;
    }
    dialog.resolve(value);
    setDialog(null);
  }

  const value = { confirm, prompt, toast };

  return <DialogContext.Provider value={value}>
    {children}
    {dialog?.kind === "confirm" ? <Modal title={dialog.options.title} onClose={close} className="max-w-md">
      <p className="text-sm leading-6 text-[var(--betanor-muted)]">{dialog.options.description}</p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={close}>{dialog.options.cancelLabel ?? "Cancel"}</Button>
        <Button type="button" variant={dialog.options.destructive ? "danger" : "primary"} onClick={() => { dialog.resolve(true); setDialog(null); }}>
          {dialog.options.confirmLabel ?? "Continue"}
        </Button>
      </div>
    </Modal> : null}
    {dialog?.kind === "prompt" ? <Modal title={dialog.options.title} onClose={close} className="max-w-md">
      <form onSubmit={submitPrompt} className="space-y-4">
        {dialog.options.description ? <p className="text-sm leading-6 text-[var(--betanor-muted)]">{dialog.options.description}</p> : null}
        <div className="space-y-1.5">
          <label htmlFor="app-dialog-prompt" className="text-sm font-medium text-[var(--betanor-navy)]">{dialog.options.inputLabel}</label>
          <Input id="app-dialog-prompt" autoFocus value={promptValue} placeholder={dialog.options.placeholder} onChange={(event) => { setPromptValue(event.target.value); setPromptError(""); }} />
          {promptError ? <p role="alert" className="text-xs text-[var(--betanor-danger)]">{promptError}</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>Cancel</Button>
          <Button type="submit">{dialog.options.submitLabel ?? "Continue"}</Button>
        </div>
      </form>
    </Modal> : null}
    {toastNotice ? <div className="pwa-safe-floating fixed bottom-4 right-4 z-[90] w-[min(92vw,24rem)] sm:bottom-6 sm:right-6" role={toastNotice.variant === "error" ? "alert" : "status"} aria-live={toastNotice.variant === "error" ? "assertive" : "polite"} aria-atomic="true">
      <div className={`flex items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-xl ${toastNotice.variant === "error" ? "border-rose-200" : toastNotice.variant === "success" ? "border-emerald-200" : "border-blue-200"}`}>
        <p className={`min-w-0 flex-1 text-sm leading-5 ${toastNotice.variant === "error" ? "text-rose-800" : toastNotice.variant === "success" ? "text-emerald-800" : "text-[var(--betanor-navy)]"}`}>{toastNotice.message}</p>
        <button type="button" onClick={() => setToastNotice(null)} className="grid size-7 shrink-0 place-items-center rounded-md text-lg text-[var(--betanor-muted)] hover:bg-slate-100" aria-label="Dismiss notification">×</button>
      </div>
    </div> : null}
  </DialogContext.Provider>;
}

export function useAppDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useAppDialog must be used within AppDialogProvider.");
  return context;
}
