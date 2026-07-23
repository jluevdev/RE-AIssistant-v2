export default function SetupRequired({ issues }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white border border-amber-200 rounded-xl shadow-sm p-8">
        <h1 className="text-xl font-bold text-slate-900 mb-2">Firebase setup required</h1>
        <p className="text-slate-600 mb-4">
          The app cannot start until your local <code className="text-sm bg-slate-100 px-1 rounded">.env</code> has a valid Firebase Web API key.
        </p>
        <ul className="text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-lg p-4 mb-4 space-y-1 list-disc list-inside">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        <ol className="text-sm text-slate-700 space-y-2 mb-4 list-decimal list-inside">
          <li>Open Firebase Console → project <strong>realestatescheduler-fa876</strong></li>
          <li>Project settings → Your apps → copy the <strong>Web API Key</strong></li>
          <li>Paste into <code className="bg-slate-100 px-1 rounded">RE-AIssistant-v2/.env</code> as <code className="bg-slate-100 px-1 rounded">VITE_FIREBASE_API_KEY=AIza...</code></li>
          <li>Restart the dev server (<code className="bg-slate-100 px-1 rounded">npm run dev</code>)</li>
        </ol>
        <p className="text-xs text-slate-500">
          After saving .env, stop Vite (Ctrl+C) and run <code className="bg-slate-100 px-1 rounded">npm run dev</code> again so the new key loads.
        </p>
      </div>
    </div>
  );
}
