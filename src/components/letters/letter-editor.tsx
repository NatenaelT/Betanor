"use client";

import { useEffect, useRef } from "react";

function cleanInitial(value: string) { return value.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "").replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, ""); }

export function LetterEditor({ value, onChange, disabled = false }: { value: string; onChange: (value: string) => void; disabled?: boolean }) {
  const editor = useRef<HTMLDivElement>(null); const initialized = useRef(false);
  useEffect(() => { if (editor.current && !initialized.current) { editor.current.innerHTML = cleanInitial(value || "<p></p>"); initialized.current = true; } }, [value]);
  const command = (name: string, argument?: string) => { if (disabled) return; editor.current?.focus(); document.execCommand(name, false, argument); onChange(editor.current?.innerHTML ?? ""); };
  const link = () => { const url = window.prompt("Secure link (https:// or mailto:)"); if (url) command("createLink", url); };
  const table = () => { if (disabled) return; editor.current?.focus(); document.execCommand("insertHTML", false, "<table><tbody><tr><td>Item</td><td>Details</td></tr><tr><td></td><td></td></tr></tbody></table><p></p>"); onChange(editor.current?.innerHTML ?? ""); };
  const tools: Array<[string, string, string?]> = [["Bold", "bold"], ["Italic", "italic"], ["Underline", "underline"], ["Bulleted list", "insertUnorderedList"], ["Numbered list", "insertOrderedList"], ["Align left", "justifyLeft"], ["Align center", "justifyCenter"], ["Align right", "justifyRight"], ["Undo", "undo"], ["Redo", "redo"]];
  return <div className="overflow-hidden rounded-xl border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)]"><div className="flex flex-wrap gap-1 border-b border-[var(--betanor-field-border)] bg-[var(--betanor-surface)] p-2">{tools.map(([label, action]) => <button key={action} type="button" title={label} aria-label={label} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => command(action)} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-[var(--betanor-header-text)] hover:bg-white disabled:opacity-40">{label === "Bold" ? "B" : label === "Italic" ? "I" : label === "Underline" ? "U" : label.slice(0, 3)}</button>)}<button type="button" onMouseDown={(event) => event.preventDefault()} onClick={link} disabled={disabled} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-[var(--betanor-header-text)] hover:bg-white disabled:opacity-40">Link</button><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={table} disabled={disabled} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-[var(--betanor-header-text)] hover:bg-white disabled:opacity-40">Table</button></div><div ref={editor} contentEditable={!disabled} role="textbox" aria-multiline="true" onInput={() => onChange(editor.current?.innerHTML ?? "")} className="min-h-72 p-4 text-sm leading-7 text-[var(--betanor-field-text)] outline-none [&_a]:text-blue-700 [&_a]:underline [&_li]:ml-5 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2" /></div>;
}

export default LetterEditor;
