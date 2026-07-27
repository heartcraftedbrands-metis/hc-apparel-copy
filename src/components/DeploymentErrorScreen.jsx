import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function DeploymentErrorScreen({
  title = 'HC Apparel is temporarily unavailable',
  message = 'The storefront could not finish loading. Please try again shortly.',
  details = [],
}) {
  return (
    <main className="min-h-screen bg-[#faf8f2] px-5 py-16 text-slate-900">
      <section className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 shadow-sm">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <AlertTriangle className="h-6 w-6 text-amber-700" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>

        {details.length > 0 && (
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Deployment configuration
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {details.map((detail) => <li key={detail}>{detail}</li>)}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#486126] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3d5220]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>

        <p className="mt-5 text-xs text-slate-500">
          Need help? Contact support@ilovehcapparel.net.
        </p>
      </section>
    </main>
  );
}

