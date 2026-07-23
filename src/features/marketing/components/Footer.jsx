import { Link } from 'react-router-dom';
import { brand } from '../../../theme/tokens';
import { footer as footerContent } from '../marketingContent';

function FooterLink({ item }) {
  if (item.href) {
    return (
      <a href={item.href} className="text-sm text-slate-500 hover:text-brand-700">
        {item.label}
      </a>
    );
  }
  if (item.to) {
    return (
      <Link to={item.to} className="text-sm text-slate-500 hover:text-brand-700">
        {item.label}
      </Link>
    );
  }
  return (
    <a href={item.href || '#'} className="text-sm text-slate-500 hover:text-brand-700">
      {item.label}
    </a>
  );
}

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2 font-semibold text-brand-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
                {brand.shortName}
              </span>
              {brand.name}
            </div>
            <p className="mt-3 max-w-xs text-sm text-slate-500">{footerContent.tagline}</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">Product</h3>
            <ul className="mt-3 space-y-2">
              {footerContent.columns.product.map((item) => (
                <li key={item.label}>
                  <FooterLink item={item} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">Company</h3>
            <ul className="mt-3 space-y-2">
              {footerContent.columns.company.map((item) => (
                <li key={item.label}>
                  <FooterLink item={item} />
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900">Legal</h3>
            <ul className="mt-3 space-y-2">
              {footerContent.columns.legal.map((item) => (
                <li key={item.label}>
                  <FooterLink item={item} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-10 border-t border-slate-100 pt-6 text-center text-sm text-slate-400">
          © {year} {brand.name}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
