import PricingCards from '../components/PricingCards';
import FAQ from '../components/FAQ';
import CTASection from '../components/CTASection';
import { faq } from '../marketingContent';

const PRICING_FAQ = faq.slice(0, 4);

export default function PricingPage() {
  return (
    <>
      <PricingCards className="pt-10 sm:pt-12" />
      <FAQ items={PRICING_FAQ} title="Pricing questions" />
      <CTASection />
    </>
  );
}
