import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";
function value(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }

async function registerDocument(data: FormData) {
  "use server";
  const fileName = value(data, "fileName"); const storagePath = value(data, "storagePath");
  if (!fileName || !storagePath) return;
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.workspaceId || !access.permissions.has("files.manage")) return;
  await supabase.from("documents").insert({ workspace_id: access.workspaceId, file_name: fileName, storage_path: storagePath, mime_type: value(data, "mimeType") || null, size_bytes: Number(value(data, "sizeBytes") || 0) || null, classification: value(data, "classification") || "internal", owner_id: access.userId });
  revalidatePath("/workspace/documents");
}

async function removeDocument(data: FormData) {
  "use server";
  const id = value(data, "id"); if (!id) return;
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("files.manage")) return;
  await supabase.from("documents").delete().eq("id", id); revalidatePath("/workspace/documents");
}

export default async function DocumentsPage() {
  const supabase = await createClient(); const access = await resolveWorkspace(supabase);
  if (!access.permissions.has("files.manage")) redirect("/workspace");
  const { data: documents } = access.workspaceId ? await supabase.from("documents").select("id,file_name,storage_path,mime_type,size_bytes,classification,owner_id,created_at").eq("workspace_id", access.workspaceId).order("created_at", { ascending: false }) : { data: [] as never[] };
  return <main className="mx-auto max-w-7xl px-6 py-10 lg:px-8"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">System</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Files & documents</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Register contracts, briefs, invoices, and brand files against the workspace with a clear classification and storage path.</p></div><Badge tone="info">Admin protected</Badge></div><Card className="mt-8 p-5 sm:p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Register a stored file</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">Upload bytes through the configured Supabase Storage bucket, then register the resulting path here. This avoids exposing storage credentials in the browser.</p><form action={registerDocument} className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4"><div><FieldLabel htmlFor="doc-name">File name</FieldLabel><Input id="doc-name" name="fileName" required /></div><div><FieldLabel htmlFor="doc-path">Storage path</FieldLabel><Input id="doc-path" name="storagePath" required placeholder="workspace/contracts/file.pdf" /></div><div><FieldLabel htmlFor="doc-type">MIME type</FieldLabel><Input id="doc-type" name="mimeType" placeholder="application/pdf" /></div><div><FieldLabel htmlFor="doc-size">Size (bytes)</FieldLabel><Input id="doc-size" name="sizeBytes" type="number" min="0" /></div><div><FieldLabel htmlFor="doc-classification">Classification</FieldLabel><select id="doc-classification" name="classification" className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm"><option value="internal">Internal</option><option value="confidential">Confidential</option><option value="public">Public</option></select></div><div className="flex items-end md:col-span-2 lg:col-span-3"><Button type="submit">Register document</Button></div></form></Card><Card className="mt-8 overflow-hidden"><div className="border-b border-[var(--betanor-border)] px-5 py-4"><h2 className="font-semibold text-[var(--betanor-navy)]">Workspace files</h2><p className="mt-1 text-xs text-[var(--betanor-muted)]">{documents?.length ?? 0} registered document{documents?.length === 1 ? "" : "s"}.</p></div>{documents?.length ? <div className="divide-y divide-[var(--betanor-border)]">{documents.map((document) => <div key={document.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--betanor-navy)]">{document.file_name}</p><p className="mt-1 truncate text-xs text-[var(--betanor-muted)]">{document.storage_path}{document.mime_type ? ` · ${document.mime_type}` : ""}</p></div><div className="flex items-center gap-3"><Badge tone="neutral">{document.classification}</Badge><form action={removeDocument}><input type="hidden" name="id" value={document.id}/><Button type="submit" variant="outline" size="sm">Remove record</Button></form></div></div>)}</div> : <p className="px-5 py-10 text-sm text-[var(--betanor-muted)]">No files are registered yet.</p>}</Card></main>;
}
