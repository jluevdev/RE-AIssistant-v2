import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Copy, UserPlus, Users } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db, functions } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Select,
  Table,
  Tooltip,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  toast,
} from '../../components/ui';
import useTeam from './useTeam';

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  agent: 'Agent',
};

function roleTone(role) {
  if (role === 'owner') return 'brand';
  if (role === 'admin') return 'accent';
  return 'neutral';
}

export default function TeamPage() {
  const { userProfile, refreshUserProfile } = useAuth();
  const { team, members, loading, isOwner, isAdmin } = useTeam();
  const [searchParams] = useSearchParams();
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', brokerage: '' });
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'agent' });
  const [pendingInvites, setPendingInvites] = useState([]);
  const [busy, setBusy] = useState('');
  const [seatCount, setSeatCount] = useState(5);

  const seatsUsed = team?.seats?.used ?? team?.memberCount ?? members.length;
  const seatsPurchased = team?.seats?.purchased ?? 1;

  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      toast.success('Team billing updated');
    }
  }, [searchParams]);

  useEffect(() => {
    if (!team?.id || !isAdmin) {
      setPendingInvites([]);
      return undefined;
    }

    let unsub = () => {};
    const q = query(
      collection(db, 'teamInvites'),
      where('teamId', '==', team.id),
      where('status', '==', 'pending')
    );

    unsub = onSnapshot(
      q,
      (snap) => setPendingInvites(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => {
        unsub = onSnapshot(
          query(collection(db, 'teamInvites'), where('teamId', '==', team.id)),
          (snap) => {
            setPendingInvites(
              snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => i.status === 'pending')
            );
          }
        );
      }
    );

    return () => unsub();
  }, [team?.id, isAdmin]);

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        const order = { owner: 0, admin: 1, agent: 2 };
        return (order[a.role] ?? 9) - (order[b.role] ?? 9);
      }),
    [members]
  );

  async function handleCreateTeam() {
    if (!createForm.name.trim()) {
      toast.error('Team name is required');
      return;
    }
    setBusy('create');
    try {
      const createTeam = httpsCallable(functions, 'createTeam');
      await createTeam({
        name: createForm.name.trim(),
        brokerage: createForm.brokerage.trim(),
      });
      await refreshUserProfile();
      toast.success('Team created');
      setShowCreate(false);
      setCreateForm({ name: '', brokerage: '' });
    } catch (error) {
      toast.error(error.message || 'Failed to create team');
    } finally {
      setBusy('');
    }
  }

  async function handleInvite() {
    if (!inviteForm.email.trim()) {
      toast.error('Email is required');
      return;
    }
    setBusy('invite');
    try {
      const inviteMember = httpsCallable(functions, 'inviteMember');
      const { data } = await inviteMember({
        email: inviteForm.email.trim(),
        role: inviteForm.role,
      });
      if (data?.inviteUrl) {
        await navigator.clipboard.writeText(data.inviteUrl);
        toast.success('Invite created — link copied to clipboard');
      } else {
        toast.success('Invite sent');
      }
      setShowInvite(false);
      setInviteForm({ email: '', role: 'agent' });
    } catch (error) {
      toast.error(error.message || 'Failed to invite member');
    } finally {
      setBusy('');
    }
  }

  async function copyInviteLink(token) {
    const url = `${window.location.origin}/join/${token}`;
    await navigator.clipboard.writeText(url);
    toast.success('Invite link copied');
  }

  async function handleRevokeInvite(inviteId) {
    setBusy(`revoke-${inviteId}`);
    try {
      const revokeInvite = httpsCallable(functions, 'revokeInvite');
      await revokeInvite({ inviteId });
      toast.success('Invite revoked');
    } catch (error) {
      toast.error(error.message || 'Failed to revoke invite');
    } finally {
      setBusy('');
    }
  }

  async function handleChangeRole(uid, role) {
    setBusy(`role-${uid}`);
    try {
      const changeMemberRole = httpsCallable(functions, 'changeMemberRole');
      await changeMemberRole({ uid, role });
      toast.success('Role updated');
    } catch (error) {
      toast.error(error.message || 'Failed to change role');
    } finally {
      setBusy('');
    }
  }

  async function handleRemoveMember(uid) {
    if (!window.confirm('Remove this member from the team?')) return;
    setBusy(`remove-${uid}`);
    try {
      const removeMember = httpsCallable(functions, 'removeMember');
      await removeMember({ uid });
      toast.success('Member removed');
    } catch (error) {
      toast.error(error.message || 'Failed to remove member');
    } finally {
      setBusy('');
    }
  }

  async function handleLeaveTeam() {
    if (!window.confirm('Leave this team? Your personal data stays with you.')) return;
    setBusy('leave');
    try {
      const leaveTeam = httpsCallable(functions, 'leaveTeam');
      await leaveTeam();
      await refreshUserProfile();
      toast.success('You left the team');
    } catch (error) {
      toast.error(error.message || 'Failed to leave team');
    } finally {
      setBusy('');
    }
  }

  async function handleTeamCheckout() {
    setBusy('checkout');
    try {
      const createTeamCheckoutSession = httpsCallable(functions, 'createTeamCheckoutSession');
      const { data } = await createTeamCheckoutSession({
        teamId: team.id,
        seats: seatCount,
      });
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('Checkout URL missing');
    } catch (error) {
      toast.error(error.message || 'Failed to start team checkout');
    } finally {
      setBusy('');
    }
  }

  if (loading && userProfile?.teamId) {
    return (
      <div className="space-y-4">
        <PageHeader icon={Building2} title="Team" subtitle="Loading team…" backTo="/dashboard" />
        <Card className="animate-pulse h-40" />
      </div>
    );
  }

  if (!userProfile?.teamId) {
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader
          icon={Building2}
          title="Team"
          subtitle="Create a brokerage team or accept an invite from your admin."
          backTo="/dashboard"
          actions={
            <Button type="button" onClick={() => setShowCreate(true)}>
              <UserPlus className="w-4 h-4" />
              Create a team
            </Button>
          }
        />
        <Card>
          <EmptyState
            icon={Users}
            title="No team yet"
            description="Start a team to share listings and offers with your agents. If you already have an account, accepting an invite takes one click — no migration needed."
          />
        </Card>

        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create team">
          <div className="space-y-4">
            <Input
              label="Team / brokerage name"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Acme Realty Group"
            />
            <Input
              label="Brokerage (optional)"
              value={createForm.brokerage}
              onChange={(e) => setCreateForm((f) => ({ ...f, brokerage: e.target.value }))}
              placeholder="KW, eXp, independent…"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTeam} disabled={busy === 'create'}>
                {busy === 'create' ? 'Creating…' : 'Create team'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Building2}
        title={team?.name || 'Team'}
        subtitle={team?.brokerage || 'Shared workspace for your brokerage'}
        backTo="/dashboard"
        actions={
          <Badge tone={team?.billing?.status === 'active' ? 'success' : 'neutral'}>
            {seatsUsed}/{seatsPurchased} seats
          </Badge>
        }
      />

      <div className="flex flex-wrap gap-2">
        {isAdmin && (
          <Button onClick={() => setShowInvite(true)}>
            <UserPlus className="w-4 h-4" />
            Invite member
          </Button>
        )}
        {isOwner && (
          <Tooltip content="Premium Team billing — purchase seats before inviting agents.">
            <Button variant="secondary" onClick={handleTeamCheckout} disabled={busy === 'checkout'}>
              Add seats / billing
            </Button>
          </Tooltip>
        )}
        {!isOwner && (
          <Button variant="ghost" onClick={handleLeaveTeam} disabled={busy === 'leave'}>
            Leave team
          </Button>
        )}
      </div>

      {isOwner && (
        <Card>
          <h3 className="font-semibold text-slate-900">Seat billing</h3>
          <p className="mt-1 text-sm text-slate-500">
            Premium Team plan — purchase seats for your agents. Current: {seatsUsed} used of{' '}
            {seatsPurchased} purchased.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <Select
              label="Seats to purchase"
              value={String(seatCount)}
              onChange={(e) => setSeatCount(Number(e.target.value))}
              className="w-40"
            >
              {[3, 5, 10, 15, 25, 50].map((n) => (
                <option key={n} value={n}>
                  {n} seats
                </option>
              ))}
            </Select>
            <Button onClick={handleTeamCheckout} disabled={busy === 'checkout'}>
              {busy === 'checkout' ? 'Redirecting…' : 'Checkout'}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-semibold text-slate-900 mb-4">Members</h3>
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {sortedMembers.map((member) => (
                <Tr key={member.uid || member.id}>
                  <Td>{member.displayName || '—'}</Td>
                  <Td className="text-slate-600">{member.email}</Td>
                  <Td>
                    <Badge tone={roleTone(member.role)}>{ROLE_LABELS[member.role] || member.role}</Badge>
                  </Td>
                  <Td className="text-right">
                    {isAdmin && member.role !== 'owner' && (
                      <div className="flex justify-end gap-2">
                        <Select
                          value={member.role}
                          onChange={(e) => handleChangeRole(member.uid, e.target.value)}
                          disabled={busy === `role-${member.uid}`}
                          className="w-28"
                        >
                          <option value="agent">Agent</option>
                          <option value="admin">Admin</option>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMember(member.uid)}
                          disabled={busy === `remove-${member.uid}`}
                        >
                          Remove
                        </Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>

        <div className="md:hidden space-y-3">
          {sortedMembers.map((member) => (
            <Card key={member.uid || member.id} className="border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{member.displayName || '—'}</p>
                  <p className="text-sm text-slate-500">{member.email}</p>
                </div>
                <Badge tone={roleTone(member.role)}>{ROLE_LABELS[member.role] || member.role}</Badge>
              </div>
            </Card>
          ))}
        </div>
      </Card>

      {isAdmin && pendingInvites.length > 0 && (
        <Card>
          <h3 className="font-semibold text-slate-900 mb-4">Pending invites</h3>
          <div className="space-y-3">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900">{invite.email}</p>
                  <p className="text-xs text-slate-500 capitalize">{invite.role || 'agent'} invite</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyInviteLink(invite.token)}
                  >
                    <Copy className="w-4 h-4" />
                    Copy link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevokeInvite(invite.id)}
                    disabled={busy === `revoke-${invite.id}`}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite team member">
        <div className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={inviteForm.email}
            onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="agent@brokerage.com"
          />
          <Select
            label="Role"
            value={inviteForm.role}
            onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))}
          >
            <option value="agent">Agent</option>
            <option value="admin">Admin</option>
          </Select>
          <p className="text-xs text-slate-500">
            Existing accounts can accept in one click — their personal data stays separate.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={busy === 'invite'}>
              {busy === 'invite' ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
