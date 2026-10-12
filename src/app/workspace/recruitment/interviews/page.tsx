import { RecruitmentWorkspace } from "@/components/recruitment/recruitment-workspace";

export const dynamic = "force-dynamic";

export default async function InterviewsPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  return <RecruitmentWorkspace view="interviews" searchParams={searchParams} />;
}
