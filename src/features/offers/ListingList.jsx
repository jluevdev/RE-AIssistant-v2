import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Card, EmptyState, PageHeader } from '../../components/ui';

export default function ListingList() {
  const { currentUser, userProfile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const uid = currentUser?.uid;
    if (!uid) {
      setRows([]);
      setLoading(false);
      return undefined;
    }
    const owned = query(collection(db, 'listings'), where('ownerUid', '==', uid));
    const unsubs = [];
    const buckets = { owned: [], team: [] };
    const emit = () => {
      const byId = new Map();
      [...buckets.owned, ...buckets.team].forEach((row) => byId.set(row.id, row));
      setRows([...byId.values()]);
      setLoading(false);
    };
    unsubs.push(onSnapshot(owned, (snap) => {
      buckets.owned = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      emit();
    }, () => {
      buckets.owned = [];
      emit();
    }));
    if (userProfile?.teamId) {
      const teamQuery = query(collection(db, 'listings'), where('teamId', '==', userProfile.teamId));
      unsubs.push(onSnapshot(teamQuery, (snap) => {
        buckets.team = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
        emit();
      }, () => emit()));
    }
    return () => unsubs.forEach((unsub) => unsub());
  }, [currentUser?.uid, userProfile?.teamId]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Listings"
        subtitle="Listing hubs you have created."
        backTo="/dashboard"
        actions={
          <Button as={Link} to="/listings/new">New listing</Button>
        }
      />
      {loading ? (
        <Card className="h-24 animate-pulse" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No listings yet"
            description="Create a listing hub when you want a public page for offer submissions."
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((row) => (
            <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">{row.title || row.address}</p>
                <p className="text-sm text-slate-500">{row.address}</p>
              </div>
              {row.hubSlug && (
                <Button as={Link} to={`/listing/${row.hubSlug}`} variant="outline" size="sm">
                  Open hub
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
