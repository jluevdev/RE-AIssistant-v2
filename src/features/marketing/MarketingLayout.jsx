import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import MarketingNav from './components/MarketingNav';
import Footer from './components/Footer';

export default function MarketingLayout() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <MarketingNav />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
