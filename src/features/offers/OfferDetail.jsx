import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileSearch } from 'lucide-react'
import { db, functions as fbFunctions } from '../../config/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { Badge, Button, Card, EmptyState, Input, PageHeader } from '../../components/ui'

export default function OfferDetail() {
  const { offerId } = useParams()
  const [offer, setOffer] = useState(null)
  const [events, setEvents] = useState([])
  const [files, setFiles] = useState([])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const snap = await getDoc(doc(db, 'offers', offerId))
      if (snap.exists()) setOffer({ id: snap.id, ...snap.data() })
      const getTimeline = httpsCallable(fbFunctions, 'getOfferTimeline')
      const timeline = await getTimeline({ offerId })
      setEvents(timeline?.data?.events || [])
      const getFiles = httpsCallable(fbFunctions, 'getOfferAttachments')
      const res = await getFiles({ offerId })
      setFiles(res?.data?.attachments || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [offerId])

  const addNote = async () => {
    if (!note.trim()) return
    const add = httpsCallable(fbFunctions, 'addOfferNote')
    await add({ offerId, note: note.trim() })
    setNote('')
    load()
  }

  if (loading) {
    return (
      <div>
        <PageHeader icon={FileSearch} title="Offer Detail" backTo="/offers" backLabel="Back to offers" />
        <p className="text-sm text-slate-600">Loading…</p>
      </div>
    )
  }

  if (!offer) {
    return (
      <div>
        <PageHeader icon={FileSearch} title="Offer Detail" backTo="/offers" backLabel="Back to offers" />
        <Card>
          <EmptyState title="Offer not found" description="This offer may have been removed or you may not have access." />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileSearch}
        title="Offer Detail"
        subtitle={`${offer.meta?.buyerAgentName || 'Agent'} · ${offer.status || 'pending'}`}
        backTo="/offers"
        backLabel="Back to offers"
        actions={
          <Badge tone={offer.status === 'accepted' ? 'success' : offer.status === 'declined' ? 'danger' : 'neutral'}>
            {offer.status || 'pending'}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <Card>
            <h2 className="font-semibold text-slate-900 mb-3">Timeline</h2>
            <div className="space-y-2">
              {events.length === 0 ? (
                <p className="text-sm text-slate-500">No events yet</p>
              ) : events.map(ev => (
                <div key={ev.id} className="text-sm border-b border-slate-100 pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      {ev.type === 'note' ? 'Note' : (ev.status ? `Status: ${ev.status}` : 'Event')}
                      {ev.note ? ` — ${ev.note}` : ''}
                    </div>
                    <div className="text-slate-400 text-xs shrink-0">
                      {ev.createdAt?.seconds ? new Date(ev.createdAt.seconds * 1000).toLocaleString() : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Input
                containerClassName="flex-1"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Add note"
              />
              <Button onClick={addNote}>Add</Button>
            </div>
          </Card>

          {files.length > 0 && (
            <Card>
              <h2 className="font-semibold text-slate-900 mb-3">Attachments</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {files.map(f => (
                  <div key={f.name} className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 text-sm border-b border-slate-200 flex items-center justify-between">
                      <div className="truncate">{f.name}</div>
                      <a target="_blank" rel="noreferrer" href={f.url} className="text-brand-600 text-xs">Open</a>
                    </div>
                    <iframe title={f.name} src={f.url} className="w-full h-64" />
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold text-slate-900 mb-3">Summary</h2>
            <div className="text-sm space-y-1">
              <div><span className="text-slate-500">Price:</span> {offer.meta?.price || '-'}</div>
              <div><span className="text-slate-500">Financing:</span> {offer.meta?.financing || '-'}</div>
              <div><span className="text-slate-500">Concessions:</span> {offer.meta?.concessions || '-'}</div>
              <div><span className="text-slate-500">Close:</span> {offer.meta?.closeDate || '-'}</div>
              <div><span className="text-slate-500">Contingencies:</span> {offer.meta?.contingencies || '-'}</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
