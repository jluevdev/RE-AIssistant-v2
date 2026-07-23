import { Link } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <h1 className="text-4xl font-bold text-slate-900 mb-2">RE AIssistant v2</h1>
      <p className="text-slate-600 mb-8 text-center max-w-md">
        Clean fork scaffold. Feature modules will be ported in Phase 3.
      </p>
      <div className="flex gap-3">
        <Link
          to="/login"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          Sign in
        </Link>
        <Link
          to="/signup"
          className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-100"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
