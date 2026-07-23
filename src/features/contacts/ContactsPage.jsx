import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Clock,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
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
  TBody,
  Td,
  Th,
  THead,
  Tr,
  toast,
} from '../../components/ui';
import { formatPhone, formatRelativeTime, normalizePhoneKey } from '../messages/messageUtils';
import {
  CONTACT_TYPES,
  TYPE_LABELS,
  collectTags,
  filterContacts,
  normalizeEmail,
  sortContacts,
} from './contactUtils';
import { fetchContactSources, planContactSync } from './useContactSync';

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'buyer', label: 'Buyers' },
  { id: 'seller', label: 'Sellers' },
  { id: 'listing_agent', label: 'Listing agents' },
];

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  type: 'buyer',
  tags: [],
  notes: '',
};

function typeTone(type) {
  if (type === 'buyer') return 'brand';
  if (type === 'seller') return 'success';
  if (type === 'listing_agent') return 'warning';
  return 'neutral';
}

function TagList({ tags }) {
  if (!tags?.length) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge key={tag} tone="neutral" className="normal-case">
          {tag}
        </Badge>
      ))}
    </div>
  );
}

function ContactActions({ contact, onEdit, onLog, onDelete, compact = false }) {
  return (
    <div className={`flex ${compact ? 'flex-wrap gap-2 mt-3' : 'items-center justify-end gap-1'}`}>
      {contact.phone && (
        <Link
          to="/messages"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
          title="Open Messages"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {!compact && 'SMS'}
        </Link>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={() => onLog(contact)}>
        <Clock className="w-3.5 h-3.5" />
        Log contact
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(contact)}>
        <Pencil className="w-3.5 h-3.5" />
        Edit
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => onDelete(contact)}>
        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
        Delete
      </Button>
    </div>
  );
}

export default function ContactsPage() {
  const { currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('');
  const [syncNote, setSyncNote] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const syncStarted = useRef(false);

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openCreateModal();
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) {
      setContacts([]);
      setLoading(false);
      return undefined;
    }

    let unsubscribe = () => {};

    const indexedQuery = query(
      collection(db, 'contacts'),
      where('userId', '==', currentUser.uid),
      orderBy('updatedAt', 'desc'),
      limit(500)
    );

    const applySnapshot = (snapshot) => {
      setContacts(
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
      );
      setLoading(false);
    };

    unsubscribe = onSnapshot(
      indexedQuery,
      applySnapshot,
      (error) => {
        const needsIndex = String(error?.message || '').toLowerCase().includes('index');
        if (needsIndex) {
          const fallbackQuery = query(
            collection(db, 'contacts'),
            where('userId', '==', currentUser.uid)
          );
          unsubscribe = onSnapshot(fallbackQuery, applySnapshot, () => setLoading(false));
          return;
        }
        console.error('Contacts subscription error:', error);
        toast.error('Could not load contacts.');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [currentUser?.uid]);

  const runSync = useCallback(
    async (existingContacts) => {
      if (!currentUser?.uid || syncStarted.current) return;
      syncStarted.current = true;

      try {
        const sources = await fetchContactSources(currentUser.uid);
        const { toCreate, toUpdate } = planContactSync(existingContacts, sources);
        if (!toCreate.length && !toUpdate.length) return;

        const batch = writeBatch(db);
        const now = serverTimestamp();

        for (const contact of toCreate) {
          const ref = doc(collection(db, 'contacts'));
          batch.set(ref, {
            userId: currentUser.uid,
            name: contact.name || '',
            phone: contact.phone || '',
            email: contact.email || '',
            type: contact.type || 'other',
            tags: contact.tags || [],
            notes: contact.notes || '',
            source: contact.source || 'manual',
            lastContactedAt: contact.lastContactedAt || null,
            createdAt: now,
            updatedAt: now,
          });
        }

        for (const { id, patch } of toUpdate) {
          batch.update(doc(db, 'contacts', id), {
            ...patch,
            updatedAt: now,
          });
        }

        await batch.commit();
        setSyncNote('Synced from your activity');
      } catch (error) {
        console.warn('Contact auto-sync failed:', error);
      }
    },
    [currentUser?.uid]
  );

  useEffect(() => {
    if (!loading && currentUser?.uid && !syncStarted.current) {
      runSync(contacts);
    }
  }, [loading, currentUser?.uid, contacts, runSync]);

  const sortedContacts = useMemo(() => sortContacts(contacts), [contacts]);
  const allTags = useMemo(() => collectTags(sortedContacts), [sortedContacts]);
  const filteredContacts = useMemo(
    () => filterContacts(sortedContacts, { search, type: typeFilter, tag: tagFilter }),
    [sortedContacts, search, typeFilter, tagFilter]
  );

  const openCreateModal = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setTagInput('');
    setModalOpen(true);
  };

  const openEditModal = (contact) => {
    setEditing(contact);
    setForm({
      name: contact.name || '',
      phone: contact.phone || '',
      email: contact.email || '',
      type: contact.type || 'other',
      tags: [...(contact.tags || [])],
      notes: contact.notes || '',
    });
    setTagInput('');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setTagInput('');
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || form.tags.includes(tag)) {
      setTagInput('');
      return;
    }
    setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    setTagInput('');
  };

  const removeTag = (tag) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  const handleTagKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addTag();
    }
  };

  const handleSave = async () => {
    if (!currentUser?.uid) return;
    if (!form.name.trim() && !form.phone.trim() && !form.email.trim()) {
      toast.error('Add at least a name, phone, or email.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        userId: currentUser.uid,
        name: form.name.trim(),
        phone: normalizePhoneKey(form.phone),
        email: normalizeEmail(form.email),
        type: form.type || 'other',
        tags: form.tags,
        notes: form.notes.trim(),
        updatedAt: serverTimestamp(),
      };

      if (editing) {
        await updateDoc(doc(db, 'contacts', editing.id), payload);
        toast.success('Contact updated');
      } else {
        const ref = doc(collection(db, 'contacts'));
        const batch = writeBatch(db);
        batch.set(ref, {
          ...payload,
          source: 'manual',
          lastContactedAt: null,
          createdAt: serverTimestamp(),
        });
        await batch.commit();
        toast.success('Contact added');
      }
      closeModal();
    } catch (error) {
      console.error('Save contact failed:', error);
      toast.error('Could not save contact.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogContact = async (contact) => {
    try {
      await updateDoc(doc(db, 'contacts', contact.id), {
        lastContactedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Logged contact');
    } catch (error) {
      console.error('Log contact failed:', error);
      toast.error('Could not log contact.');
    }
  };

  const handleDelete = async (contact) => {
    if (!window.confirm(`Delete ${contact.name || 'this contact'}?`)) return;
    try {
      await deleteDoc(doc(db, 'contacts', contact.id));
      toast.success('Contact deleted');
    } catch (error) {
      console.error('Delete contact failed:', error);
      toast.error('Could not delete contact.');
    }
  };

  return (
    <div>
      <PageHeader
        title="Contacts"
        subtitle="Your book of business — auto-filled from open houses, offers, and buyer tours."
        actions={
          <Button type="button" onClick={openCreateModal}>
            <Plus className="w-4 h-4" />
            Add contact
          </Button>
        }
      />

      {syncNote && (
        <p className="mb-4 text-sm text-accent-700 bg-accent-50 border border-accent-200 rounded-lg px-3 py-2">
          {syncNote}
        </p>
      )}

      <div className="space-y-4 mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            type="search"
            placeholder="Search name, phone, email, or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search contacts"
          />
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
          {TYPE_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTypeFilter(id)}
              className={[
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                typeFilter === id
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">Tags:</span>
            <button
              type="button"
              onClick={() => setTagFilter('')}
              className={[
                'rounded-full border px-2.5 py-0.5 text-xs',
                !tagFilter ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600',
              ].join(' ')}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tagFilter === tag ? '' : tag)}
                className={[
                  'rounded-full border px-2.5 py-0.5 text-xs',
                  tagFilter === tag
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading contacts…</p>
      ) : filteredContacts.length === 0 ? (
        <EmptyState
          icon={Users}
          title={contacts.length === 0 ? 'No contacts yet' : 'No matches'}
          description={
            contacts.length === 0
              ? 'Contacts appear here automatically from open house check-ins, submitted offers, buyer tours, and SMS. You can also add them manually.'
              : 'Try a different search or filter.'
          }
          action={
            contacts.length === 0 ? (
              <Button type="button" onClick={openCreateModal}>
                <Plus className="w-4 h-4" />
                Add your first contact
              </Button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>Phone</Th>
                  <Th>Email</Th>
                  <Th>Tags</Th>
                  <Th>Last contacted</Th>
                  <Th className="text-right">Actions</Th>
                </Tr>
              </THead>
              <TBody>
                {filteredContacts.map((contact) => (
                  <Tr key={contact.id}>
                    <Td className="font-medium text-slate-900">{contact.name || '—'}</Td>
                    <Td>
                      <Badge tone={typeTone(contact.type)}>
                        {TYPE_LABELS[contact.type] || contact.type}
                      </Badge>
                    </Td>
                    <Td>{contact.phone ? formatPhone(contact.phone) : '—'}</Td>
                    <Td className="max-w-[180px] truncate">{contact.email || '—'}</Td>
                    <Td>
                      <TagList tags={contact.tags} />
                    </Td>
                    <Td>{formatRelativeTime(contact.lastContactedAt) || '—'}</Td>
                    <Td>
                      <ContactActions
                        contact={contact}
                        onEdit={openEditModal}
                        onLog={handleLogContact}
                        onDelete={handleDelete}
                      />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>

          <div className="md:hidden space-y-3">
            {filteredContacts.map((contact) => (
              <Card key={contact.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{contact.name || 'Unknown'}</p>
                    <Badge tone={typeTone(contact.type)} className="mt-1">
                      {TYPE_LABELS[contact.type] || contact.type}
                    </Badge>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {formatRelativeTime(contact.lastContactedAt) || 'Never'}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  {contact.phone && (
                    <p className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-slate-400" />
                      {formatPhone(contact.phone)}
                    </p>
                  )}
                  {contact.email && <p className="truncate">{contact.email}</p>}
                </div>
                {contact.tags?.length > 0 && (
                  <div className="mt-2">
                    <TagList tags={contact.tags} />
                  </div>
                )}
                {contact.notes && (
                  <p className="mt-2 text-sm text-slate-500 line-clamp-2">{contact.notes}</p>
                )}
                <ContactActions
                  contact={contact}
                  onEdit={openEditModal}
                  onLog={handleLogContact}
                  onDelete={handleDelete}
                  compact
                />
              </Card>
            ))}
          </div>
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? 'Edit contact' : 'Add contact'}
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add contact'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Jane Smith"
          />
          <Input
            label="Phone"
            type="tel"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="(555) 123-4567"
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="jane@example.com"
          />
          <Select
            label="Type"
            value={form.type}
            onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
          >
            {CONTACT_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </Select>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tags</label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add tag and press Enter"
                aria-label="New tag"
              />
              <Button type="button" variant="secondary" onClick={addTag}>
                Add
              </Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-200"
                  >
                    {tag}
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="contact-notes" className="block text-xs font-medium text-slate-600 mb-1">
              Notes
            </label>
            <textarea
              id="contact-notes"
              rows={4}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              placeholder="Follow-up notes, preferences, etc."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
