import { RecruitmentWorkspace } from "@/components/recruitment/recruitment-workspace";

export const dynamic = "force-dynamic";

export default async function ShortlistingPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  return <RecruitmentWorkspace view="shortlisting" searchParams={searchParams} />;
}
