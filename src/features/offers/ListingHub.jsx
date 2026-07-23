import React, { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Send } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { functions as fbFunctions } from '../../config/firebase'
import toast from 'react-hot-toast'

const ListingHub = () => {
  const { hubSlug } = useParams()
  const [offer, setOffer] = useState({
    buyerAgentName: '',
    buyerAgentEmail: '',
    buyerAgentPhone: '',
    price: '',
    financing: '',
    concessions: '',
    closeDate: '',
    contingencies: '',
    notes: ''
  })
  const [files, setFiles] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submittedId, setSubmittedId] = useState('')

  const onChange = (field, value) => setOffer(prev => ({ ...prev, [field]: value }))

  const onFile = (e) => {
    setFiles(Array.from(e.target.files || []))
  }

  const submit = async () => {
    if (!hubSlug) return
    setSubmitting(true)
    try {
      const callable = httpsCallable(fbFunctions, 'submitOfferInit')
      const init = await callable({ hubSlug, meta: offer, filenames: files.map(f => ({ name: f.name, type: f.type, size: f.size })) })
      const { uploadUrls = [], offerId } = init?.data || {}
      // PUT uploads sequentially (simple)
      for (let i = 0; i < uploadUrls.length; i++) {
        const url = uploadUrls[i]
        const file = files[i]
        if (!url || !file) continue
        await fetch(url, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
      }
      const finalize = httpsCallable(fbFunctions, 'submitOfferFinalize')
      await finalize({ offerId })
      setSubmittedId(offerId)
      toast.success('Offer submitted successfully')
    } catch (e) {
      console.error('submitOffer error', e)
      alert('Failed to submit offer. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Submit Offer</h1>
        <div className="text-sm text-gray-500">Listing hub: {hubSlug}</div>
      </div>

      {submittedId ? (
        <div className="p-4 bg-green-50 border border-green-200 rounded">Thanks! Your offer was received. Reference ID: {submittedId}</div>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Agent Name</label>
              <input className="w-full border rounded px-3 py-2" value={offer.buyerAgentName} onChange={e => onChange('buyerAgentName', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Agent Email</label>
              <input type="email" className="w-full border rounded px-3 py-2" value={offer.buyerAgentEmail} onChange={e => onChange('buyerAgentEmail', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Agent Phone</label>
              <input className="w-full border rounded px-3 py-2" value={offer.buyerAgentPhone} onChange={e => onChange('buyerAgentPhone', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
              <input className="w-full border rounded px-3 py-2" value={offer.price} onChange={e => onChange('price', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Financing</label>
              <input className="w-full border rounded px-3 py-2" value={offer.financing} onChange={e => onChange('financing', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Concessions</label>
              <input className="w-full border rounded px-3 py-2" value={offer.concessions} onChange={e => onChange('concessions', e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Close Date</label>
              <input type="date" className="w-full border rounded px-3 py-2" value={offer.closeDate} onChange={e => onChange('closeDate', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Contingencies</label>
              <input className="w-full border rounded px-3 py-2" value={offer.contingencies} onChange={e => onChange('contingencies', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea rows={4} className="w-full border rounded px-3 py-2" value={offer.notes} onChange={e => onChange('notes', e.target.value)} />
            </div>
          </section>

          <section>
            <label className="block text-sm font-medium text-gray-700 mb-1">Attach files (PDF/images)</label>
            <input type="file" multiple onChange={onFile} />
            {files.length > 0 && (
              <div className="mt-2 text-xs text-gray-500">{files.length} file(s) selected</div>
            )}
          </section>

          <div>
            <button disabled={submitting} onClick={submit} className="inline-flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              <Send className="w-4 h-4" /> Submit Offer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ListingHub


