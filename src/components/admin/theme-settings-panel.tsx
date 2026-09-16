"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { DEFAULT_STYLE_SETTINGS, STYLE_COLOR_FIELDS, STYLE_FONT_FAMILIES, type StyleSettings } from "@/lib/style-settings";

type Theme = StyleSettings & { id: string; workspace_id: string; name: string; template_key: string; is_active: boolean; created_at: string; updated_at: string };

const templates: Array<{ key: string; name: string; description: string; values: StyleSettings }> = [
  { key: "classic", name: "Betanor Classic", description: "Navy, gold, and bright operational surfaces.", values: DEFAULT_STYLE_SETTINGS },
  { key: "ocean", name: "Addis Ocean", description: "A calm blue system for customer-facing work.", values: { ...DEFAULT_STYLE_SETTINGS, primary_color: "#075985", accent_color: "#22D3EE", nav_color: "#082F49", nav_text_color: "#E0F2FE", header_color: "#F0F9FF", header_text_color: "#0C4A6E", footer_color: "#082F49", footer_text_color: "#BAE6FD", button_color: "#0369A1", field_focus_color: "#06B6D4" } },
  { key: "highlands", name: "Highlands Light", description: "A light, welcoming palette with green signals.", values: { ...DEFAULT_STYLE_SETTINGS, primary_color: "#14532D", accent_color: "#CA8A04", surface_color: "#F7FEE7", nav_color: "#1C1917", nav_text_color: "#ECFDF5", header_color: "#FFFBEB", header_text_color: "#14532D", footer_color: "#1C1917", footer_text_color: "#D6D3D1", button_color: "#166534", field_focus_color: "#16A34A" } },
];

const themeColumns = "id,workspace_id,name,template_key,font_family,heading_font_family,primary_color,accent_color,surface_color,text_color,nav_color,nav_text_color,header_color,header_text_color,footer_color,footer_text_color,button_color,button_text_color,field_background_color,field_text_color,field_border_color,field_focus_color,radius_scale,is_active,created_at,updated_at";

async function requestJson(path: string, init?: RequestInit) {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  return payload;
}

export function ThemeSettingsPanel() {
  const router = useRouter();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [templateKey, setTemplateKey] = useState("classic");
  const [newName, setNewName] = useState("");
  const [draft, setDraft] = useState<Theme | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    requestJson(`/api/admin/themes?columns=${encodeURIComponent(themeColumns)}`).then((data) => {
      if (!active) return;
      const next = (data.themes ?? []) as Theme[];
      setThemes(next);
      setSelectedId(next.find((theme) => theme.is_active)?.id || next[0]?.id || "");
    }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load themes."); });
    return () => { active = false; };
  }, []);

  const selected = useMemo(() => themes.find((theme) => theme.id === selectedId) ?? draft, [draft, selectedId, themes]);
  function setField(field: keyof StyleSettings, value: string) {
    setThemes((current) => current.map((theme) => theme.id === selectedId ? { ...theme, [field]: value } : theme));
    setDraft((current) => current ? { ...current, [field]: value } : current);
  }

  async function createTheme() {
    const template = templates.find((item) => item.key === templateKey) ?? templates[0];
    const name = newName.trim() || template.name;
    setBusy(true); setError(null); setMessage(null);
    try {
      const data = await requestJson("/api/admin/themes", { method: "POST", body: JSON.stringify({ name, templateKey: template.key, ...template.values, isActive: false }) });
      const next = data.theme as Theme;
      setThemes((current) => [...current, next]); setSelectedId(next.id); setNewName(""); setMessage(`${next.name} created from template.`);
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Could not create the theme."); }
    finally { setBusy(false); }
  }

  async function saveTheme(apply = false) {
    if (!selected) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const data = await requestJson("/api/admin/themes", { method: "PATCH", body: JSON.stringify({ ...selected, id: selected.id, isActive: apply || selected.is_active }) });
      const next = data.theme as Theme;
      setThemes((current) => current.map((theme) => theme.id === next.id ? next : { ...theme, is_active: apply ? false : theme.is_active }));
      setMessage(apply ? `${next.name} is now active across the portal and workspace.` : "Theme changes saved.");
      router.refresh();
    } catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Could not save the theme."); }
    finally { setBusy(false); }
  }

  async function deleteTheme() {
    if (!selected || selected.is_active) return;
    if (!window.confirm(`Delete ${selected.name}? This cannot be undone.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try { await requestJson("/api/admin/themes", { method: "DELETE", body: JSON.stringify({ id: selected.id }) }); const remaining = themes.filter((theme) => theme.id !== selected.id); setThemes(remaining); setSelectedId(remaining[0]?.id || ""); setMessage("Theme deleted."); }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "Could not delete the theme."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-6"><div className="grid gap-6 xl:grid-cols-[.85fr_1.15fr]"><Card className="p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Themes</h2><p className="mt-1 text-sm leading-6 text-[var(--betanor-muted)]">Create a reusable template, edit it, and apply it to every public and authenticated portal route.</p></div><Badge tone="info">Database-backed</Badge></div><div className="mt-5"><FieldLabel htmlFor="theme-select">Edit theme</FieldLabel><select id="theme-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 text-sm text-[var(--betanor-field-text)]">{themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}{theme.is_active ? " · Active" : ""}</option>)}</select></div><div className="mt-6 border-t border-[var(--betanor-border)] pt-5"><h3 className="text-sm font-semibold text-[var(--betanor-navy)]">Create from template</h3><div className="mt-3 grid gap-3"><select value={templateKey} onChange={(event) => setTemplateKey(event.target.value)} className="min-h-10 rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 text-sm text-[var(--betanor-field-text)]">{templates.map((template) => <option key={template.key} value={template.key}>{template.name}</option>)}</select><Input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Optional theme name" /><p className="text-xs leading-5 text-[var(--betanor-muted)]">{templates.find((template) => template.key === templateKey)?.description}</p><Button type="button" disabled={busy} onClick={createTheme}>Create theme</Button></div></div><div className="mt-6 space-y-2">{themes.map((theme) => <button type="button" key={theme.id} onClick={() => setSelectedId(theme.id)} className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${theme.id === selectedId ? "border-[var(--betanor-blue)] bg-blue-50" : "border-[var(--betanor-border)] hover:bg-slate-50"}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[var(--betanor-navy)]">{theme.name}</span><span className="mt-1 block text-xs text-[var(--betanor-muted)]">{theme.template_key}</span></span>{theme.is_active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Saved</Badge>}</button>)}</div></Card><Card className="p-5 sm:p-6">{selected ? <><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Edit {selected.name}</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Every token below is live data, not a read-only swatch.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={() => saveTheme(false)}>Update theme</Button><Button size="sm" disabled={busy || selected.is_active} variant="secondary" onClick={() => saveTheme(true)}>Apply theme</Button><Button size="sm" disabled={busy || selected.is_active || themes.length <= 1} variant="danger" onClick={deleteTheme}>Delete</Button></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><FieldLabel htmlFor="theme-name">Theme name</FieldLabel><Input id="theme-name" value={selected.name} onChange={(event) => setThemes((current) => current.map((theme) => theme.id === selected.id ? { ...theme, name: event.target.value } : theme))} className="mt-2" /></div><div><FieldLabel htmlFor="theme-template">Template label</FieldLabel><Input id="theme-template" value={selected.template_key} onChange={(event) => setThemes((current) => current.map((theme) => theme.id === selected.id ? { ...theme, template_key: event.target.value } : theme))} className="mt-2" /></div><div><FieldLabel htmlFor="theme-body-font">Body font</FieldLabel><select id="theme-body-font" value={selected.font_family} onChange={(event) => setField("font_family", event.target.value)} className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 text-sm text-[var(--betanor-field-text)]">{STYLE_FONT_FAMILIES.map((font) => <option key={font}>{font}</option>)}</select></div><div><FieldLabel htmlFor="theme-heading-font">Heading font</FieldLabel><select id="theme-heading-font" value={selected.heading_font_family} onChange={(event) => setField("heading_font_family", event.target.value)} className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 text-sm text-[var(--betanor-field-text)]">{STYLE_FONT_FAMILIES.map((font) => <option key={font}>{font}</option>)}</select></div><div><FieldLabel htmlFor="theme-radius">Corner density</FieldLabel><select id="theme-radius" value={selected.radius_scale} onChange={(event) => setField("radius_scale", event.target.value as StyleSettings["radius_scale"])} className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] px-3 text-sm text-[var(--betanor-field-text)]"><option value="compact">Compact</option><option value="medium">Medium</option><option value="soft">Soft</option></select></div></div><div className="mt-6 grid gap-3 sm:grid-cols-2">{STYLE_COLOR_FIELDS.map(([field, label]) => { const key = field as keyof StyleSettings; const value = selected[key] as string; return <div key={field} className="rounded-lg border border-[var(--betanor-border)] p-3"><FieldLabel htmlFor={`theme-${field}`}>{label}</FieldLabel><div className="mt-2 flex items-center gap-2"><input id={`theme-${field}-picker`} type="color" value={value} onChange={(event) => setField(key, event.target.value.toUpperCase())} className="size-10 cursor-pointer rounded border border-[var(--betanor-field-border)] bg-[var(--betanor-field-background)] p-1" /><Input id={`theme-${field}`} value={value} pattern="#[0-9A-Fa-f]{6}" onChange={(event) => setField(key, event.target.value.toUpperCase())} /></div></div>; })}</div><div className="mt-6 grid gap-4 rounded-xl border border-[var(--betanor-border)] p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-[var(--betanor-navy)]">Portal preview</p>{selected.is_active ? <Badge tone="success">Currently applied</Badge> : <Badge tone="neutral">Draft preview</Badge>}</div><div className="grid gap-3 sm:grid-cols-3"><div style={{ background: selected.nav_color, color: selected.nav_text_color }} className="rounded-lg p-3 text-xs font-semibold">Navigation hover<br /><span className="mt-2 block opacity-75">Left edge + menu</span></div><div style={{ background: selected.header_color, color: selected.header_text_color }} className="rounded-lg border p-3 text-xs font-semibold">Header<br /><span className="mt-2 block opacity-75">Public + portal</span></div><div style={{ background: selected.footer_color, color: selected.footer_text_color }} className="rounded-lg p-3 text-xs font-semibold">Footer<br /><span className="mt-2 block opacity-75">Links + contact</span></div></div><div className="flex flex-wrap items-center gap-3"><button type="button" style={{ background: selected.button_color, color: selected.button_text_color }} className="rounded-lg px-4 py-2 text-sm font-semibold">Button token</button><input aria-label="Form field preview" value="Form field token" readOnly style={{ background: selected.field_background_color, color: selected.field_text_color, borderColor: selected.field_border_color }} className="min-h-10 rounded-lg border px-3 text-sm" /></div></div></> : <p className="text-sm text-[var(--betanor-muted)]">Create or select a theme to edit its tokens.</p>}</Card></div>{error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}{message ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</p> : null}</div>;
}
