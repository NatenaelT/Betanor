import { redirect } from "next/navigation";

import { LetterTemplateManager } from "@/components/letters/template-manager";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

export default async function LetterTemplatesPage() { const access = await resolveWorkspace(await createClient()); if (!access.permissions.has("letters.manage_templates")) redirect("/workspace/letters"); return <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10"><div className="mb-8"><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Documents · Letters</p><h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">Reusable letter templates</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--betanor-muted)]">Maintain approved correspondence patterns with safe, non-executable placeholders.</p></div><LetterTemplateManager /></main>; }
