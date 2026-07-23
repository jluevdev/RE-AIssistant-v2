import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { Button } from '../../../components/ui';
import { brand } from '../../../theme/tokens';

const NAV_LINKS = [
  { label: 'Features', hash: 'features' },
  { label: 'Pricing', hash: 'pricing' },
  { label: 'FAQ', hash: 'faq' },
];

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const navOffset = 72;
  const top = el.getBoundingClientRect().top + window.scrollY - navOffset;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
}

export default function MarketingNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const onLanding = location.pathname === '/';

  function handleHashClick(hash) {
    setOpen(false);
    if (onLanding) {
      scrollToSection(hash);
      window.history.replaceState(null, '', `#${hash}`);
      return;
    }
    navigate({ pathname: '/', hash: `#${hash}` });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold text-brand-700">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            {brand.shortName}
          </span>
          <span className="hidden sm:inline">{brand.name}</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <button
              key={link.label}
              type="button"
              onClick={() => handleHashClick(link.hash)}
              className="text-sm font-medium text-slate-600 hover:text-brand-700"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button as={Link} to="/login" variant="ghost" size="sm">
            Sign in
          </Button>
          <Button as={Link} to="/signup" size="sm">
            Start $10 trial
          </Button>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                type="button"
                className="text-left text-sm font-medium text-slate-700"
                onClick={() => handleHashClick(link.hash)}
              >
                {link.label}
              </button>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-4">
              <Button as={Link} to="/login" variant="outline" size="sm" onClick={() => setOpen(false)}>
                Sign in
              </Button>
              <Button as={Link} to="/signup" size="sm" onClick={() => setOpen(false)}>
                Start $10 trial
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
