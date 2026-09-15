export function formatEtb(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-ET", { style: "currency", currency: "ETB", minimumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
}

export function titleCase(value: string | null | undefined) {
  return String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function financeTone(status: string | null | undefined) {
  if (status === "approved") return "success" as const;
  if (status === "rejected" || status === "cancelled") return "danger" as const;
  if (status === "submitted" || status === "in_review") return "warning" as const;
  return "draft" as const;
}

