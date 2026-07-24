import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, Button, Input, toast } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';

export default function DeleteAccountModal({ open, onClose }) {
  const { deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  async function handleDelete() {
    if (!canDelete || busy) return;
    setBusy(true);
    try {
      await deleteAccount();
      toast.success('Account deleted. You can sign up again with the same email.');
      onClose();
      navigate('/signup', { replace: true });
    } catch (error) {
      toast.error(error.message || 'Could not delete account.');
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (busy) return;
    setConfirmText('');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Delete account"
      size="sm"
      footer={(
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            disabled={!canDelete || busy}
          >
            {busy ? 'Deleting…' : 'Delete my account'}
          </Button>
        </div>
      )}
    >
      <div className="space-y-4 text-sm text-slate-600">
        <p>
          This permanently removes your account, messages, listings, open houses, and other data.
          You can create a new account afterward with the same email.
        </p>
        <p className="text-rose-700 font-medium">
          Team owners must transfer ownership before deleting their account.
        </p>
        <div>
          <label htmlFor="delete-confirm" className="block text-slate-700 font-medium mb-1">
            Type DELETE to confirm
          </label>
          <Input
            id="delete-confirm"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            disabled={busy}
          />
        </div>
      </div>
    </Modal>
  );
}
