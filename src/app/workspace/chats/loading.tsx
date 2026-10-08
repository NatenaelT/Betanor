export default function ChatsLoading() {
  return <main className="mx-auto max-w-[1600px] animate-pulse px-3 py-5 sm:px-5 lg:px-7 lg:py-7" aria-label="Loading messages">
    <div className="mb-4 h-16 max-w-xl rounded-xl bg-slate-100" />
    <div className="grid min-h-[min(72vh,720px)] overflow-hidden rounded-2xl border border-[var(--betanor-border)] bg-white lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
      <div className="border-b p-3 lg:border-r lg:border-b-0">
        <div className="h-10 rounded-lg bg-slate-100" />
        <div className="mt-3 space-y-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-16 rounded-lg bg-slate-50" />)}</div>
      </div>
      <div className="flex min-h-[430px] flex-col p-4 sm:p-6">
        <div className="h-10 w-1/2 rounded-lg bg-slate-100" />
        <div className="mt-auto h-24 rounded-xl bg-slate-50" />
      </div>
    </div>
  </main>;
}
