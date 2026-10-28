"use server";

import { createClient } from "@/lib/supabase/server";

export async function applyToJob(data: FormData): Promise<{ ok: boolean; message?: string }> {
  const jobOpeningId = String(data.get("jobOpeningId") ?? "").trim();
  const email = String(data.get("email") ?? "").trim();
  const resumePath = String(data.get("resumePath") ?? "").trim();
  const coverLetterPath = String(data.get("coverLetterPath") ?? "").trim();
  let formResponses: Record<string, string | string[]>;

  try {
    const parsed = JSON.parse(String(data.get("formResponses") ?? "{}")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    formResponses = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string | string[]] => typeof entry[1] === "string" || (Array.isArray(entry[1]) && entry[1].every((item) => typeof item === "string"))));
  } catch {
    return { ok: false, message: "Please review the application answers and try again." };
  }

  if (!jobOpeningId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "A valid email address is required." };
  }
  if (!resumePath) return { ok: false, message: "Please attach your CV or resume." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_public_job_application", {
    job_opening_id_input: jobOpeningId,
    first_name_input: String(data.get("firstName") ?? "").trim().slice(0, 100),
    last_name_input: String(data.get("lastName") ?? "").trim().slice(0, 100),
    email_input: email.slice(0, 254),
    phone_input: String(data.get("phone") ?? "").trim().slice(0, 40),
    form_responses_input: formResponses,
    resume_path_input: resumePath,
    cover_letter_path_input: coverLetterPath || null,
  });

  if (error) {
    const message = error.message || "We could not submit your application.";
    return { ok: false, message: message.length > 240 ? "We could not submit your application. Please review the details and try again." : message };
  }

  return { ok: true };
}
