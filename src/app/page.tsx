import { PublicHeader } from "@/components/navigation/public-header";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--betanor-surface)]">
      <PublicHeader />
      <main className="grid place-items-center px-6 py-16 sm:py-24">
        <section className="w-full max-w-2xl rounded-2xl border border-[var(--betanor-border)] bg-white p-8 shadow-sm sm:p-12">
          <p className="mb-4 text-sm font-semibold tracking-[0.18em] text-[var(--betanor-blue)] uppercase">
            Betanor General Trading P.L.C.
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--betanor-navy)] sm:text-5xl">
            Technology You Can Rely On.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--betanor-muted)]">
            The Betanor Digital Business Platform foundation is in progress. Public
            experiences and the internal workspace will be introduced in planned phases.
          </p>
          <div className="mt-8 border-l-4 border-[var(--betanor-gold)] pl-4 text-sm text-[var(--betanor-muted)]">
            Phase 1: application foundation, environment safety, and Supabase client boundaries.
          </div>
        </section>
      </main>
    </div>
  );
}
