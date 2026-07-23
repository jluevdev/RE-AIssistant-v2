import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { GitCompare } from 'lucide-react'
import { db, functions as fbFunctions } from '../../config/firebase'
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../../contexts/AuthContext'
import { Badge, Button, Card, EmptyState, PageHeader, Table, TBody, Td, Th, THead, Tr } from '../../components/ui'

export default function OfferCompare() {
  const { currentUser } = useAuth()
  const [offers, setOffers] = useState([])
  const [loading, setLoading] = useState(true)
  const [attachments, setAttachments] = useState({}) // offerId -> [{name,url}]

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const ownerUid = currentUser?.uid
        if (!ownerUid) { setOffers([]); return }
        const q = query(collection(db, 'offers'), where('ownerUid', '==', ownerUid), orderBy('createdAt', 'desc'))
        const snap = await getDocs(q)
        const rows = []
        snap.forEach(d => rows.push({ id: d.id, ...d.data() }))
        setOffers(rows)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [currentUser?.uid])

  const setStatus = async (offerId, status) => {
    try {
      const callable = httpsCallable(fbFunctions, 'setOfferStatus')
      await callable({ offerId, status })
      setOffers(prev => prev.map(o => o.id === offerId ? { ...o, status } : o))
    } catch (e) {
      console.error('update status failed', e)
    }
  }

  const loadAttachments = async (offerId) => {
    try {
      const callable = httpsCallable(fbFunctions, 'getOfferAttachments')
      const res = await callable({ offerId })
      setAttachments(prev => ({ ...prev, [offerId]: res?.data?.attachments || [] }))
    } catch (e) {
      console.error('load attachments failed', e)
      setAttachments(prev => ({ ...prev, [offerId]: [] }))
    }
  }

  if (loading) {
    return (
      <div>
        <PageHeader icon={GitCompare} title="Offer Compare" subtitle="Compare offers side by side." />
        <p className="text-sm text-slate-600">Loading…</p>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        icon={GitCompare}
        title="Offer Compare"
        subtitle="Compare offers side by side and track status changes."
        backTo="/dashboard"
        backLabel="Dashboard"
        actions={
          <Button as={Link} to="/listings/new" variant="outline" size="sm">
            Create Listing
          </Button>
        }
      />

      {offers.length === 0 ? (
        <Card>
          <EmptyState
            title="No offers yet"
            description="Create a listing hub, share the link with buyer agents, and offers appear here for side-by-side comparison."
            action={
              <Button as={Link} to="/listings/new">
                Create listing hub
              </Button>
            }
          />
        </Card>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Agent</Th>
              <Th>Price</Th>
              <Th>Financing</Th>
              <Th>Concessions</Th>
              <Th>Close</Th>
              <Th>Contingencies</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </Tr>
          </THead>
          <TBody>
            {offers.map(o => (
              <Tr key={o.id}>
                <Td>{o.meta?.buyerAgentName || '-'}</Td>
                <Td>{o.meta?.price || '-'}</Td>
                <Td>{o.meta?.financing || '-'}</Td>
                <Td>{o.meta?.concessions || '-'}</Td>
                <Td>{o.meta?.closeDate || '-'}</Td>
                <Td>{o.meta?.contingencies || '-'}</Td>
                <Td>
                  <Badge tone={o.status === 'accepted' ? 'success' : o.status === 'declined' ? 'danger' : 'neutral'}>
                    {o.status || 'pending'}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="accent" onClick={() => setStatus(o.id, 'accepted')}>Accept</Button>
                    <Button size="sm" variant="danger" onClick={() => setStatus(o.id, 'declined')}>Decline</Button>
                    <Button size="sm" variant="outline" onClick={() => loadAttachments(o.id)}>View Files</Button>
                    <Button as={Link} to={`/offers/${o.id}`} size="sm">Open</Button>
                  </div>
                  {attachments[o.id]?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {attachments[o.id].map(a => (
                        <div key={a.name} className="text-xs">
                          <a href={a.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{a.name}</a>
                          <span className="text-slate-400 ml-2">{Math.round((a.size||0)/1024)} KB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  )
}
