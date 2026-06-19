const navigationItems = [
  "Dashboard",
  "Workstreams",
  "Timeline",
  "Notebook",
  "Governance",
  "Reports",
  "Settings",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-8 lg:flex-row lg:gap-8">
        <aside className="mb-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:mb-0 lg:w-72">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-700">PGW</p>
            <h1 className="mt-2 text-2xl font-bold">Project Governance Workspace</h1>
          </div>
          <nav aria-label="Primary navigation" className="space-y-2">
            {navigationItems.map((item) => (
              <a
                className="block rounded-2xl px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                href={`#${item.toLowerCase()}`}
                key={item}
              >
                {item}
              </a>
            ))}
          </nav>
        </aside>

        <section className="flex-1 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-10">
          <header className="mb-10 flex flex-col gap-4 border-b border-slate-200 pb-6 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-sm font-semibold text-amber-700">No project open</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">Start a local-first governance file</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="rounded-2xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800">
                Create New Project
              </button>
              <button className="rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50">
                Open .pmgov File
              </button>
              <button className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-400" disabled>
                Save
              </button>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-3xl bg-slate-950 p-8 text-white">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">Local only</p>
              <h3 className="mt-4 text-4xl font-bold leading-tight">Your project data stays in the file you open or save.</h3>
              <p className="mt-5 max-w-2xl text-lg text-slate-200">
                PGW is a browser application for governance tracking, meeting capture, decisions,
                actions, milestones, and executive reporting. It does not use a backend, database,
                authentication, or server-side project storage.
              </p>
            </section>

            <section className="rounded-3xl border border-blue-100 bg-blue-50 p-8">
              <h3 className="text-xl font-bold text-blue-950">MVP setup complete</h3>
              <ul className="mt-5 space-y-3 text-sm text-blue-950">
                <li>• Next.js App Router application shell</li>
                <li>• TypeScript strict mode configuration</li>
                <li>• Tailwind CSS styling</li>
                <li>• ESLint validation</li>
                <li>• No backend persistence or API storage</li>
              </ul>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
