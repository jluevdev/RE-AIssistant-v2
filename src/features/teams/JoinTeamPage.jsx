import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Card, EmptyState, PageHeader, toast } from '../../components/ui';

export default function JoinTeamPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { currentUser, loading, refreshUserProfile } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);
  const [teamName, setTeamName] = useState('');

  useEffect(() => {
    if (loading || !currentUser || !token || done || accepting) return;

    (async () => {
      setAccepting(true);
      try {
        const acceptInvite = httpsCallable(functions, 'acceptInvite');
        const { data } = await acceptInvite({ token });
        await refreshUserProfile();
        setTeamName(data?.teamName || 'your team');
        setDone(true);
        toast.success(`Joined ${data?.teamName || 'team'}`);
        setTimeout(() => navigate('/team', { replace: true }), 1500);
      } catch (error) {
        toast.error(error.message || 'Could not accept invite');
      } finally {
        setAccepting(false);
      }
    })();
  }, [loading, currentUser, token, done, accepting, refreshUserProfile, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <Card className="max-w-md w-full animate-pulse h-32" />
      </div>
    );
  }

  if (!currentUser) {
    const returnUrl = encodeURIComponent(`/join/${token}`);
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <Card className="max-w-md w-full space-y-4">
          <PageHeader
            icon={Building2}
            title="Team invite"
            subtitle="Sign in with the email that received the invite, then accept."
          />
          <EmptyState
            title="Sign in to join"
            description="Use your existing RE AIssistant account — no new signup required if you already have one."
            action={
              <div className="flex flex-col gap-2 w-full">
                <Link to={`/login?returnUrl=${returnUrl}`}>
                  <Button className="w-full">Sign in</Button>
                </Link>
                <Link to={`/signup?returnUrl=${returnUrl}`}>
                  <Button variant="secondary" className="w-full">
                    Create account
                  </Button>
                </Link>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="max-w-md w-full">
        {accepting && !done && (
          <EmptyState title="Joining team…" description="One moment while we add you to the team." />
        )}
        {done && (
          <EmptyState
            title={`Welcome to ${teamName}`}
            description="Redirecting to your team page…"
            action={
              <Link to="/team">
                <Button>Go to team</Button>
              </Link>
            }
          />
        )}
        {!accepting && !done && (
          <EmptyState
            title="Invite link"
            description="If acceptance didn't start automatically, try again."
            action={
              <Button
                onClick={() => {
                  setDone(false);
                  setAccepting(false);
                }}
              >
                Retry
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
}
