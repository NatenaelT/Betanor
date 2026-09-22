import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { BetanorMark } from "@/components/brand/betanor-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldLabel, Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { resolveWorkspace } from "@/lib/workspace-context";

export const dynamic = "force-dynamic";

async function updateProfile(formData: FormData) {
  "use server";
  const supabase = await createClient(); const access = await resolveWorkspace(supabase); if (!access.userId) return;
  const fullName = String(formData.get("fullName") ?? "").trim(); const jobTitle = String(formData.get("jobTitle") ?? "").trim(); const avatar = formData.get("avatar");
  const payload: Record<string, string | null> = { full_name: fullName || null, job_title: jobTitle || null };
  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > 5 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp"].includes(avatar.type)) return;
    const extension = avatar.type.split("/")[1] || "png"; const path = `${access.userId}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from("betanor-profile-avatars").upload(path, avatar, { contentType: avatar.type, upsert: false, cacheControl: "3600" }); if (error) return;
    payload.avatar_path = path;
  }
  await supabase.from("profiles").update(payload).eq("id", access.userId);
  revalidatePath("/workspace/profile"); revalidatePath("/workspace");
}

export default async function ProfilePage() {
  const supabase = await createClient(); const access = await resolveWorkspace(supabase); if (!access.userId) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name,job_title,avatar_path,email,account_type,is_active").eq("id", access.userId).maybeSingle();
  const avatarUrl = profile?.avatar_path ? (await supabase.storage.from("betanor-profile-avatars").createSignedUrl(profile.avatar_path, 900)).data?.signedUrl : null;
  return <main className="mx-auto max-w-4xl px-5 py-8 sm:px-6 lg:px-8 lg:py-10"><div className="flex items-center gap-3"><BetanorMark /><div><p className="text-sm font-semibold tracking-[0.14em] text-[var(--betanor-blue)] uppercase">Personal area</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--betanor-navy)]">My profile</h1></div></div><div className="mt-8 grid gap-6 lg:grid-cols-[220px_1fr]"><Card className="flex flex-col items-center justify-center p-6 text-center">{avatarUrl ? <img src={avatarUrl} alt="Profile" className="size-28 rounded-full object-cover ring-4 ring-blue-50" /> : <span className="grid size-28 place-items-center rounded-full bg-[var(--betanor-navy)] text-4xl font-bold text-white">{(profile?.full_name || profile?.email || "B").slice(0, 1).toUpperCase()}</span>}<p className="mt-4 text-sm font-semibold text-[var(--betanor-navy)]">{profile?.full_name || "Betanor colleague"}</p><p className="mt-1 text-xs text-[var(--betanor-muted)]">{profile?.email || "Authenticated account"}</p></Card><Card className="p-6"><h2 className="text-lg font-semibold text-[var(--betanor-navy)]">Personal details</h2><p className="mt-2 text-sm leading-6 text-[var(--betanor-muted)]">Update the information visible to colleagues. Sensitive employment and payroll fields remain controlled by HR.</p><form action={updateProfile} className="mt-6 space-y-4" encType="multipart/form-data"><div><FieldLabel htmlFor="profile-name">Full name</FieldLabel><Input id="profile-name" name="fullName" defaultValue={profile?.full_name || ""} /></div><div><FieldLabel htmlFor="profile-title">Position / title</FieldLabel><Input id="profile-title" name="jobTitle" defaultValue={profile?.job_title || ""} /></div><div><FieldLabel htmlFor="profile-avatar">Profile picture</FieldLabel><Input id="profile-avatar" name="avatar" type="file" accept="image/png,image/jpeg,image/webp" /><p className="mt-1 text-xs text-[var(--betanor-muted)]">PNG, JPG, or WebP up to 5 MB.</p></div><Button type="submit">Save profile</Button></form></Card></div></main>;
}
