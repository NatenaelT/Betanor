"use client";

import { createContext, useCallback, useContext, useState, type FormEvent, type ReactNode } from "react";

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
};

type PendingDialog =
  | { kind: "confirm"; options: ConfirmDialogOptions; resolve: (value: boolean) => void }
  | { kind: "prompt"; options: PromptDialogOptions; resolve: (value: string | null) => void };

const DialogContext = createContext<DialogContextValue | null>(null);

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<PendingDialog | null>(null);
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

  const value = { confirm, prompt };

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
  </DialogContext.Provider>;
}

export function useAppDialog() {
  const context = useContext(DialogContext);
  if (!context) throw new Error("useAppDialog must be used within AppDialogProvider.");
  return context;
}
