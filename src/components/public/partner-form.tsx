"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FieldHint, FieldLabel, Input } from "@/components/ui/input";

const subjects = ["Technology supply", "Implementation delivery", "Managed support", "Software or systems", "Security & surveillance", "Training", "Other"];

export function PartnerForm() {
  const [message, setMessage] = useState("");

  function submit(formData: FormData) {
    const name = String(formData.get("name") ?? "");
    const organization = String(formData.get("organization") ?? "");
    const email = String(formData.get("email") ?? "");
    const phone = String(formData.get("phone") ?? "");
    const interest = String(formData.get("interest") ?? "");
    const details = String(formData.get("details") ?? "");
    const body = [`Name: ${name}`, `Organization: ${organization}`, `Email: ${email}`, `Phone: ${phone}`, `Partnership interest: ${interest}`, "", "Details:", details].join("\n");
    setMessage("Your email app is opening with your partnership enquiry addressed to Betanor.");
    window.location.assign(`mailto:info@betanor.et?subject=${encodeURIComponent(`Partnership enquiry — ${organization || name}`)}&body=${encodeURIComponent(body)}`);
  }

  return <form action={submit} className="grid gap-5"><div className="grid gap-5 sm:grid-cols-2"><div><FieldLabel htmlFor="partner-name">Your name</FieldLabel><Input id="partner-name" name="name" required /></div><div><FieldLabel htmlFor="partner-organization">Organization</FieldLabel><Input id="partner-organization" name="organization" required /></div><div><FieldLabel htmlFor="partner-email">Business email</FieldLabel><Input id="partner-email" name="email" required type="email" /></div><div><FieldLabel htmlFor="partner-phone">Phone number</FieldLabel><Input id="partner-phone" name="phone" required type="tel" /></div></div><div><FieldLabel htmlFor="partner-interest">What would you like to partner on?</FieldLabel><select className="min-h-10 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 text-sm text-[var(--betanor-text)] outline-none focus:border-[var(--betanor-electric-blue)] focus:ring-2 focus:ring-blue-100" id="partner-interest" name="interest" required defaultValue=""><option disabled value="">Select an area</option>{subjects.map((subject) => <option key={subject}>{subject}</option>)}</select></div><div><FieldLabel htmlFor="partner-details">Tell us about the opportunity</FieldLabel><textarea className="min-h-32 w-full rounded-lg border border-[var(--betanor-border)] bg-white px-3 py-2 text-sm text-[var(--betanor-text)] outline-none focus:border-[var(--betanor-electric-blue)] focus:ring-2 focus:ring-blue-100" id="partner-details" name="details" required /></div><div><Button type="submit">Send partnership enquiry</Button><FieldHint>Submitting opens your email app with the enquiry addressed to info@betanor.et.</FieldHint>{message && <p aria-live="polite" className="mt-3 text-sm font-medium text-[var(--betanor-success)]">{message}</p>}</div></form>;
}
