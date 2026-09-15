import { redirect } from "next/navigation";

function safeNextPath(next: string | undefined) {
  return next?.startsWith("/workspace") || next?.startsWith("/portal") ? next : "/workspace";
}

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(typeof next === "string" ? next : undefined);
  redirect(`/staff/login?next=${encodeURIComponent(nextPath)}`);
}
