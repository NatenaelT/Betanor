export default function WorkspaceLoading() {
  return <main className="mx-auto w-full max-w-7xl animate-pulse px-5 py-8 sm:px-6 lg:px-8 lg:py-10" aria-label="Loading workspace">
    <div className="h-3 w-36 rounded bg-slate-200" />
    <div className="mt-4 h-9 w-64 max-w-full rounded-lg bg-slate-200" />
    <div className="mt-3 h-4 w-full max-w-2xl rounded bg-slate-100" />
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => <div key={index} className="h-28 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><div className="h-4 w-24 rounded bg-slate-100" /><div className="mt-4 h-7 w-32 rounded bg-slate-100" /></div>)}
    </div>
    <div className="mt-6 h-64 rounded-2xl border border-slate-100 bg-white shadow-sm" />
  </main>;
}
