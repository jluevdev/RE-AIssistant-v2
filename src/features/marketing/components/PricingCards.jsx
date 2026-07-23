import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { Button, Card } from '../../../components/ui';
import { SUBSCRIPTION_PLANS } from '../../../config/stripe';
import { planCtas, planFeatures, pricingIntro } from '../marketingContent';

export default function PricingCards({ id, showIntro = true, compact = false, className = '' }) {
  const plans = Object.values(SUBSCRIPTION_PLANS);

  return (
    <section
      {...(id ? { id } : {})}
      className={['scroll-mt-20', compact ? '' : 'pb-16 sm:pb-20', className].filter(Boolean).join(' ')}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {showIntro && (
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              {pricingIntro.title}
            </h2>
            <p className="mt-4 text-lg text-slate-600">{pricingIntro.subtitle}</p>
            <p className="mt-3 rounded-lg border border-accent-200 bg-accent-50 px-4 py-3 text-sm font-medium text-accent-800">
              {pricingIntro.trialCallout}
            </p>
          </div>
        )}

        <div className={`grid gap-6 ${showIntro ? 'mt-12' : ''} lg:grid-cols-3`}>
          {plans.map((plan) => {
            const bullets = planFeatures[plan.key] || [];
            const cta = planCtas[plan.key] || { label: 'Start free', to: '/signup' };
            const popular = plan.popular;

            return (
              <Card
                key={plan.key}
                className={`relative flex h-full flex-col ${popular ? 'border-brand-500 ring-2 ring-brand-500/20' : ''}`}
              >
                {popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-semibold text-brand-700">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-slate-900">${plan.price}</span>
                  <span className="text-slate-500">/month</span>
                </div>

                <ul className="mt-6 flex-1 space-y-3">
                  {bullets.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-8">
                  {cta.href ? (
                    <Button as="a" href={cta.href} variant={popular ? 'primary' : 'outline'} className="w-full">
                      {cta.label}
                    </Button>
                  ) : (
                    <Button as={Link} to={cta.to} variant={popular ? 'primary' : 'outline'} className="w-full">
                      {cta.label}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
