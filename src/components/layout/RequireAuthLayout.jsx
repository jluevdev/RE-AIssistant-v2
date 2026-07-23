import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AppLayout from './AppLayout';

/**
 * Layout route for all authenticated pages: gates on auth, then renders the
 * app shell around the matched child route via <Outlet />. Adding a new
 * authenticated page is a one-line <Route> under this element.
 */
export default function RequireAuthLayout() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-600">Loading…</div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
