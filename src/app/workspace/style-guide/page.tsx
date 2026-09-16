import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FieldHint, FieldLabel, Input } from "@/components/ui/input";
import { Table, TableWrap } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_STYLE_SETTINGS, loadStyleSettings, STYLE_FONT_FAMILIES } from "@/lib/style-settings";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

const swatches = [
  ["Navy", "--betanor-navy"], ["Blue", "--betanor-blue"], ["Electric blue", "--betanor-electric-blue"], ["Gold", "--betanor-gold"], ["Surface", "--betanor-surface"], ["Success", "--betanor-success"], ["Warning", "--betanor-warning"], ["Danger", "--betanor-danger"],
];

function value(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }
function validHex(valueToCheck: string) { return /^#[0-9a-f]{6}$/i.test(valueToCheck); }

async function saveStyleSettings(data: FormData) {
  "use server";
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.roleCodes.has("SUPER_ADMIN")) redirect("/workspace");
  const fontFamily = value(data, "fontFamily");
  const headingFontFamily = value(data, "headingFontFamily");
  const primaryColor = value(data, "primaryColor").toUpperCase();
  const accentColor = value(data, "accentColor").toUpperCase();
  const surfaceColor = value(data, "surfaceColor").toUpperCase();
  const textColor = value(data, "textColor").toUpperCase();
  const radiusScale = value(data, "radiusScale");
  const isFont = (candidate: string): candidate is (typeof STYLE_FONT_FAMILIES)[number] => (STYLE_FONT_FAMILIES as readonly string[]).includes(candidate);
  if (!isFont(fontFamily) || !isFont(headingFontFamily) || !validHex(primaryColor) || !validHex(accentColor) || !validHex(surfaceColor) || !validHex(textColor) || !["compact", "medium", "soft"].includes(radiusScale)) {
    redirect("/workspace/style-guide?error=Please%20use%20the%20provided%20fonts%20and%20six-digit%20hex%20colors.");
  }
  const { error } = await supabase.from("workspace_style_settings").upsert({ workspace_id: access.workspaceId, font_family: fontFamily, heading_font_family: headingFontFamily, primary_color: primaryColor, accent_color: accentColor, surface_color: surfaceColor, text_color: textColor, radius_scale: radiusScale, updated_by: access.userId, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
  if (error) redirect(`/workspace/style-guide?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/");
  revalidatePath("/workspace/style-guide");
  redirect("/workspace/style-guide?saved=1");
}

export default async function StyleGuidePage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const access = await resolveWorkspace(supabase);
  if (!access.roleCodes.has("SUPER_ADMIN")) redirect("/workspace");
  const style = await loadStyleSettings(supabase);
  return <main className="mx-auto max-w-7xl space-y-10 px-6 py-10 lg:px-8">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Foundation / style guide</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Brand & application style</h1><p className="mt-3 max-w-3xl text-base leading-7 text-[var(--betanor-muted)]">Super Admin controls for the typography, palette, and density used across Betanor staff and customer experiences.</p></div><Badge tone="info">Super Admin only</Badge></div>
    {saved ? <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Style settings saved. New pages will use the updated brand immediately.</p> : null}
    {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}
    <Card><CardHeader><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start"><div><h2 className="font-semibold text-[var(--betanor-navy)]">Global style controls</h2><p className="mt-1 text-sm text-[var(--betanor-muted)]">Fonts are loaded from Google Fonts using a fixed allow-list. Colors are validated before they reach the application shell.</p></div><span className="rounded-full bg-[var(--betanor-light-gold)] px-3 py-1 text-xs font-bold text-[var(--betanor-dark-navy)]">style.manage</span></div></CardHeader><CardContent><form action={saveStyleSettings} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4"><div><FieldLabel htmlFor="style-font">Body font</FieldLabel><select id="style-font" name="fontFamily" defaultValue={style.font_family} className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{STYLE_FONT_FAMILIES.map((font) => <option key={font}>{font}</option>)}</select></div><div><FieldLabel htmlFor="style-heading-font">Heading font</FieldLabel><select id="style-heading-font" name="headingFontFamily" defaultValue={style.heading_font_family} className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm">{STYLE_FONT_FAMILIES.map((font) => <option key={font}>{font}</option>)}</select></div><div><FieldLabel htmlFor="style-radius">Corner density</FieldLabel><select id="style-radius" name="radiusScale" defaultValue={style.radius_scale} className="mt-2 min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="compact">Compact</option><option value="medium">Medium</option><option value="soft">Soft</option></select></div><div><FieldLabel htmlFor="style-primary">Primary color</FieldLabel><Input id="style-primary" name="primaryColor" defaultValue={style.primary_color} pattern="#[0-9A-Fa-f]{6}" required className="mt-2" /></div><div><FieldLabel htmlFor="style-accent">Accent color</FieldLabel><Input id="style-accent" name="accentColor" defaultValue={style.accent_color} pattern="#[0-9A-Fa-f]{6}" required className="mt-2" /></div><div><FieldLabel htmlFor="style-surface">Surface color</FieldLabel><Input id="style-surface" name="surfaceColor" defaultValue={style.surface_color} pattern="#[0-9A-Fa-f]{6}" required className="mt-2" /></div><div><FieldLabel htmlFor="style-text">Text color</FieldLabel><Input id="style-text" name="textColor" defaultValue={style.text_color} pattern="#[0-9A-Fa-f]{6}" required className="mt-2" /></div><div className="flex items-end"><Button type="submit">Save brand style</Button></div></form><FieldHint>Recommended contrast: keep a dark primary/text color against the selected surface. The default Betanor palette is restored by returning to {DEFAULT_STYLE_SETTINGS.font_family} and the original hex values.</FieldHint></CardContent></Card>
    <section aria-labelledby="colors-heading"><h2 id="colors-heading" className="text-lg font-semibold text-[var(--betanor-navy)]">Live color tokens</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">{swatches.map(([name, token]) => <div className="rounded-xl border border-[var(--betanor-border)] bg-white p-3" key={token}><div className="h-12 rounded-lg" style={{ background: `var(${token})` }} /><p className="mt-2 text-xs font-semibold text-[var(--betanor-navy)]">{name}</p><p className="mt-1 text-[10px] text-[var(--betanor-muted)]">{token}</p></div>)}</div></section>
    <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><h2 className="font-semibold text-[var(--betanor-navy)]">Actions</h2></CardHeader><CardContent className="flex flex-wrap gap-3"><Button>Primary action</Button><Button variant="secondary">Gold action</Button><Button variant="outline">Secondary</Button><Button variant="ghost">Tertiary</Button><Button variant="danger">Destructive</Button></CardContent></Card><Card><CardHeader><h2 className="font-semibold text-[var(--betanor-navy)]">Status language</h2></CardHeader><CardContent className="flex flex-wrap gap-3"><Badge tone="draft">Draft</Badge><Badge tone="info">In review</Badge><Badge tone="success">Approved</Badge><Badge tone="warning">Needs action</Badge><Badge tone="danger">Declined</Badge></CardContent></Card></div>
    <div className="grid gap-6 lg:grid-cols-5"><Card className="lg:col-span-2"><CardHeader><h2 className="font-semibold text-[var(--betanor-navy)]">Form fields</h2></CardHeader><CardContent><FieldLabel htmlFor="guide-email">Work email</FieldLabel><Input id="guide-email" placeholder="name@betanor.et" type="email" /><FieldHint>Labels remain visible and guidance explains input expectations.</FieldHint><div className="mt-5 flex gap-3"><Button size="sm">Save draft</Button><Button size="sm" variant="outline">Cancel</Button></div></CardContent></Card><div className="lg:col-span-3"><TableWrap><Table><caption className="sr-only">Sample operational table styling</caption><thead className="bg-slate-50 text-xs tracking-wide text-[var(--betanor-muted)] uppercase"><tr><th className="px-5 py-3 font-semibold">Reference</th><th className="px-5 py-3 font-semibold">Owner</th><th className="px-5 py-3 font-semibold">Status</th></tr></thead><tbody className="divide-y divide-[var(--betanor-border)]"><tr><td className="px-5 py-4 font-semibold text-[var(--betanor-navy)]">BT-0001</td><td className="px-5 py-4 text-[var(--betanor-muted)]">Workspace team</td><td className="px-5 py-4"><Badge tone="info">Planned</Badge></td></tr><tr><td className="px-5 py-4 font-semibold text-[var(--betanor-navy)]">BT-0002</td><td className="px-5 py-4 text-[var(--betanor-muted)]">Operations</td><td className="px-5 py-4"><Badge tone="draft">Draft</Badge></td></tr></tbody></Table></TableWrap></div></div>
  </main>;
}
