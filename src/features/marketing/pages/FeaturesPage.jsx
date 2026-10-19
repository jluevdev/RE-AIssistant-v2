import { Link } from 'react-router-dom';
import FeatureGrid from '../components/FeatureGrid';
import HowItWorks from '../components/HowItWorks';
import { Button } from '../../../components/ui';

export default function FeaturesPage() {
  return (
    <>
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 pb-4 pt-12 sm:px-6 sm:pt-16">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Product</p>
          <h1 className="mt-2 max-w-3xl text-4xl font-bold tracking-tight text-slate-900">
            Features for the way agents already work
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Inbox, open houses, offers, tours, and follow-ups in one workspace. Start a trial when you are ready to use them with real clients.
          </p>
          <div className="mt-6">
            <Button as={Link} to="/signup">Start free trial</Button>
          </div>
        </div>
      </section>
      <FeatureGrid id="features" title="What you can do" />
      <HowItWorks />
    </>
  );
}
