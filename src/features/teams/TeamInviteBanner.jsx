import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, X } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Button, toast } from '../../components/ui';
import usePendingTeamInvite from './usePendingTeamInvite';

export default function TeamInviteBanner() {
  const { userProfile, refreshUserProfile } = useAuth();
  const { invite } = usePendingTeamInvite();
  const [dismissed, setDismissed] = useState(false);
  const [accepting, setAccepting] = useState(false);

  if (dismissed || userProfile?.teamId || !invite?.token) return null;

  async function handleAccept() {
    setAccepting(true);
    try {
      const acceptInvite = httpsCallable(functions, 'acceptInvite');
      const { data } = await acceptInvite({ token: invite.token });
      await refreshUserProfile();
      toast.success(`Joined ${data?.teamName || 'team'}`);
    } catch (error) {
      toast.error(error.message || 'Could not accept invite');
    } finally {
      setAccepting(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        <Building2 className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-brand-900">
            You&apos;ve been invited to join {invite.teamName || 'a team'}
          </p>
          <p className="text-xs text-brand-700 mt-0.5">
            Accept with one click — your personal account and data stay as-is.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={handleAccept} disabled={accepting}>
          {accepting ? 'Joining…' : 'Accept invite'}
        </Button>
        <Link to={`/join/${invite.token}`} className="text-xs font-medium text-brand-700 hover:underline">
          Details
        </Link>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded p-1 text-brand-600 hover:bg-brand-100"
          aria-label="Dismiss invite banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
