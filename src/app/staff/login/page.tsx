import { redirect } from "next/navigation";

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  redirect(`/login?next=${encodeURIComponent(next?.startsWith("/workspace") ? next : "/workspace")}`);
}
