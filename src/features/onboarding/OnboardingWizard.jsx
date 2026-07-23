import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Input, Modal, Select, toast } from '../../components/ui';
import { STEP_META, STEP_ORDER, TIMEZONES } from './onboardingUtils';
import { useOnboardingUi } from './OnboardingContext';
import useOnboarding from './useOnboarding';

const TOUR_STEPS = STEP_ORDER.map((id) => STEP_META[id]);

export default function OnboardingWizard() {
  const { currentUser, userProfile, updateUserProfile } = useAuth();
  const { wizardForced, clearForcedWizard } = useOnboardingUi();
  const {
    showWizard,
    onboarding,
    saveWizardStep,
    finishWizard,
    dismissWizard,
    startOnboarding,
  } = useOnboarding();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    phone: '',
    company: '',
    timezone: 'America/Los_Angeles',
  });

  useEffect(() => {
    if (wizardForced || showWizard) {
      setOpen(true);
      setStep(onboarding.wizardStep || 0);
      setProfileForm({
        fullName: userProfile?.fullName || currentUser?.displayName || '',
        phone: userProfile?.phone || '',
        company: userProfile?.company || '',
        timezone: userProfile?.timezone || 'America/Los_Angeles',
      });
    }
  }, [wizardForced, showWizard, onboarding.wizardStep, userProfile, currentUser]);

  if (!currentUser) return null;

  async function handleSkip() {
    try {
      await dismissWizard();
      setOpen(false);
      clearForcedWizard();
    } catch (error) {
      toast.error(error.message || 'Could not save preference');
    }
  }

  async function handleNext() {
    if (step === 1) {
      if (!profileForm.fullName.trim() || !profileForm.phone.trim()) {
        toast.error('Name and phone are required');
        return;
      }
      setSaving(true);
      try {
        await updateUserProfile(currentUser.uid, {
          fullName: profileForm.fullName.trim(),
          phone: profileForm.phone.trim(),
          company: profileForm.company.trim(),
          timezone: profileForm.timezone,
        });
      } catch (error) {
        toast.error(error.message || 'Could not save profile');
        setSaving(false);
        return;
      }
      setSaving(false);
    }

    if (step === 0 && !onboarding.startedAt) {
      await startOnboarding().catch(() => {});
    }

    const next = step + 1;
    if (next >= 4) {
      try {
        await finishWizard();
        setOpen(false);
        clearForcedWizard();
        toast.success('You are all set — finish the checklist on your dashboard.');
      } catch (error) {
        toast.error(error.message || 'Could not finish setup');
      }
      return;
    }

    setStep(next);
    saveWizardStep(next).catch(() => {});
  }

  async function handleBack() {
    const prev = Math.max(0, step - 1);
    setStep(prev);
    saveWizardStep(prev).catch(() => {});
  }

  return (
    <Modal
      open={open}
      onClose={handleSkip}
      title={step === 0 ? 'Welcome to RE AIssistant' : step === 1 ? 'Your profile' : step === 2 ? 'How it fits together' : 'Ready to go'}
      size="lg"
    >
      <div className="space-y-5">
        {step === 0 && (
          <>
            <p className="text-sm text-slate-600">
              Your always-on teammate for open houses, offers, buyer tours, SMS, and follow-ups.
              A quick setup helps you get value in week one — most agents who finish rarely churn.
            </p>
            <ul className="space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                Unified inbox for every SMS conversation
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                CRM that fills itself from your activity
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                Automations and optional team sharing
              </li>
            </ul>
          </>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              This powers SMS signatures, reminders, and how the app addresses you.
            </p>
            <Input
              label="Full name"
              value={profileForm.fullName}
              onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Jane Agent"
            />
            <Input
              label="Mobile phone"
              value={profileForm.phone}
              onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+1 (555) 555-5555"
            />
            <Input
              label="Brokerage (optional)"
              value={profileForm.company}
              onChange={(e) => setProfileForm((f) => ({ ...f, company: e.target.value }))}
              placeholder="Your brokerage"
            />
            <Select
              label="Timezone"
              value={profileForm.timezone}
              onChange={(e) => setProfileForm((f) => ({ ...f, timezone: e.target.value }))}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace('America/', '').replace('_', ' ')}
                </option>
              ))}
            </Select>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Each step unlocks the next — follow the checklist on your dashboard.
            </p>
            <ol className="space-y-2">
              {TOUR_STEPS.map((item, index) => (
                <li
                  key={item.id}
                  className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.whyNext}</p>
                    <Link
                      to={item.to}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline mt-1"
                      onClick={() => {
                        setOpen(false);
                        clearForcedWizard();
                        finishWizard().catch(() => {});
                      }}
                    >
                      {item.actionLabel}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {step === 3 && (
          <div className="text-center py-4">
            <CheckCircle2 className="w-12 h-12 text-accent-600 mx-auto mb-3" />
            <p className="text-sm text-slate-600 max-w-md mx-auto">
              Your dashboard checklist tracks progress automatically. Start with Messages or run an
              open house — contacts and analytics fill in from there.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <Button type="button" variant="ghost" onClick={handleSkip}>
            Skip for now
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={handleBack} disabled={saving}>
                Back
              </Button>
            )}
            <Button type="button" onClick={handleNext} loading={saving}>
              {step === 3 ? 'Go to dashboard' : 'Continue'}
            </Button>
          </div>
        </div>
        <p className="text-center text-xs text-slate-400">
          Step {step + 1} of 4
        </p>
      </div>
    </Modal>
  );
}
