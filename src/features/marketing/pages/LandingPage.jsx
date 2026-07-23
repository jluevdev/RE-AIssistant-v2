import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Hero from '../components/Hero';
import SocialProofStrip from '../components/SocialProofStrip';
import FeatureGrid from '../components/FeatureGrid';
import HowItWorks from '../components/HowItWorks';
import PricingCards from '../components/PricingCards';
import FAQ from '../components/FAQ';
import CTASection from '../components/CTASection';

export default function LandingPage() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace('#', '');
    const el = document.getElementById(id);
    if (!el) return;
    const navOffset = 72;
    const top = el.getBoundingClientRect().top + window.scrollY - navOffset;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [location.hash]);

  return (
    <>
      <Hero />
      <SocialProofStrip />
      <FeatureGrid />
      <HowItWorks />
      <PricingCards id="pricing" className="pt-12 sm:pt-16" />
      <FAQ />
      <CTASection />
    </>
  );
}
