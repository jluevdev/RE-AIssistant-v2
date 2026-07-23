import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { faq as defaultFaq } from '../marketingContent';

export default function FAQ({ id = 'faq', items = defaultFaq, title = 'Frequently asked questions' }) {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section id={id} className="scroll-mt-20 bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
        <div className="mt-10 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {items.map((item, index) => {
            const open = openIndex === index;
            return (
              <div key={item.question}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  <span className="font-medium text-slate-900">{item.question}</span>
                  <ChevronDown
                    className={`h-5 w-5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
                {open && (
                  <div className="border-t border-slate-100 px-5 pb-4 text-sm leading-relaxed text-slate-600">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
