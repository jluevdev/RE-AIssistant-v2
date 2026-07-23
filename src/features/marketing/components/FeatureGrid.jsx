import {
  Calendar,
  FileText,
  Home,
  MessageSquare,
  Users,
  Zap,
} from 'lucide-react';
import { Card } from '../../../components/ui';
import { features } from '../marketingContent';

const ICONS = {
  MessageSquare,
  Home,
  FileText,
  Calendar,
  Zap,
  Users,
};

export default function FeatureGrid({ id = 'features', title = 'Everything you need in one workspace' }) {
  return (
    <section id={id} className="scroll-mt-20 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h2>
          <p className="mt-4 text-lg text-slate-600">
            From first showing to signed contract — manage the full client journey without switching tools.
          </p>
        </div>

        <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => {
            const Icon = ICONS[feature.icon] || MessageSquare;
            return (
              <li key={feature.title}>
                <Card hover className="h-full">
                  <div className="mb-4 inline-flex rounded-lg bg-brand-50 p-2.5 text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.description}</p>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
