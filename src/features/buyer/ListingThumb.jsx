import React, { useState } from 'react';
import { Home } from 'lucide-react';

export default function ListingThumb({ src, alt = 'Listing photo', className = '' }) {
  const original = String(src || '').trim();
  const photoUrl = original.startsWith('https://') ? original : '';
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(photoUrl) && !failed;

  return (
    <div
      className={`overflow-hidden bg-slate-100 ${className || 'h-14 w-14 shrink-0 rounded-xl border border-slate-200'}`}
    >
      {showPhoto ? (
        <img
          src={photoUrl}
          alt={alt}
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-400">
          <Home className="h-8 w-8 sm:h-7 sm:w-7" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
