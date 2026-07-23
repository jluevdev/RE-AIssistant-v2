import { Link } from 'react-router-dom';
import { Button } from '../../../components/ui';
import { ctaSection } from '../marketingContent';

export default function CTASection() {
  return (
    <section className="bg-brand-700 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{ctaSection.title}</h2>
        <p className="mt-4 text-lg text-brand-100">{ctaSection.subtitle}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button as={Link} to="/signup" variant="secondary" size="lg">
            {ctaSection.primaryCta}
          </Button>
          <Button
            as={Link}
            to="/#pricing"
            variant="ghost"
            size="lg"
            className="!border !border-white/60 !bg-white/10 !text-white hover:!bg-white/20 hover:!text-white"
          >
            {ctaSection.secondaryCta}
          </Button>
        </div>
      </div>
    </section>
  );
}
