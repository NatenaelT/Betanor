import { RecruitmentWorkspace } from "@/components/recruitment/recruitment-workspace";

export const dynamic = "force-dynamic";

export default async function RecruitmentPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  return <RecruitmentWorkspace view="vacancies" searchParams={searchParams} />;
}
