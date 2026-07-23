import React, { useState } from 'react'
import { FileText } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { db } from '../../config/firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { Button, Card, Input, PageHeader, toast } from '../../components/ui'

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

export default function ListingCreate() {
  const { currentUser, userProfile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    address: '',
    title: '',
    agentEmail: currentUser?.email || '',
    agentPhone: ''
  })
  const [saving, setSaving] = useState(false)

  const onChange = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  const create = async () => {
    if (!form.address) { toast.error('Address is required'); return }
    setSaving(true)
    try {
      const base = slugify(`${form.title || form.address}`)
      const hubSlug = `${base}-${Math.random().toString(36).slice(2,8)}`
      const doc = {
        address: form.address,
        title: form.title || form.address,
        hubSlug,
        ownerUid: currentUser?.uid || null,
        teamId: userProfile?.teamId || null,
        agentEmail: form.agentEmail,
        agentPhone: form.agentPhone,
        status: 'active',
        createdAt: serverTimestamp()
      }
      await addDoc(collection(db, 'listings'), doc)
      toast.success('Listing created')
      navigate(`/listing/${hubSlug}`)
    } catch (e) {
      console.error('create listing failed', e)
      toast.error('Failed to create listing')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Create Listing"
        subtitle="Spin up a public listing hub for offer submissions."
        backTo="/dashboard"
        backLabel="Dashboard"
      />
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            containerClassName="md:col-span-2"
            label="Address"
            value={form.address}
            onChange={e => onChange('address', e.target.value)}
            placeholder="123 Main St, City, ST"
          />
          <Input
            containerClassName="md:col-span-2"
            label="Title (optional)"
            value={form.title}
            onChange={e => onChange('title', e.target.value)}
          />
          <Input
            label="Agent Email"
            type="email"
            value={form.agentEmail}
            onChange={e => onChange('agentEmail', e.target.value)}
          />
          <Input
            label="Agent Phone"
            value={form.agentPhone}
            onChange={e => onChange('agentPhone', e.target.value)}
          />
        </div>
        <div className="mt-5">
          <Button loading={saving} disabled={saving} onClick={create}>
            Create Listing
          </Button>
        </div>
      </Card>
    </div>
  )
}
