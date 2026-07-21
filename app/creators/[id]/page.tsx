'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'

type Campaign = {
  id: string
  client_name: string
  deliverables: string[]
  content_links: string[]
  notes: string
  status: string
  created_at: string
}

type Creator = {
  id: string
  name: string
  email: string
  phone: string
  ig_handle: string
  ig_followers: string
  tt_handle: string
  tt_followers: string
  yt_handle: string
  yt_followers: string
  tier: string
  categories: string[]
  location: string
  city: string
  country: string
  gender: string
  rate_notes: string
  notes: string
  status: string
  creator_campaigns: Campaign[]
}

const CATEGORIES = [
  'Home & Renovation', 'Lifestyle', 'Food & Travel', 'Fashion & Beauty',
  'Fitness', 'Comedy', 'Parenting', 'Business', 'Gaming', 'Tech', 'Podcast',
]
const DELIVERABLES = ['IG Reel', 'IG Story', 'IG Post', 'TikTok Reel', 'TikTok Story', 'YouTube Video', 'YouTube Short', 'UGC (no posting)', 'Podcast']
const STATUSES = ['prospect', 'active', 'complete', 'fell_through']
const TIERS = ['micro', 'mid', 'macro', 'celebrity']

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-[#EF22DA] text-black',
  prospect: 'bg-black text-white',
  complete: 'bg-[#D5D5D5] text-black',
  fell_through: 'bg-[#E5E5E5] text-neutral-400',
}

const TIER_LABEL: Record<string, string> = {
  micro: 'Micro <10k',
  mid: 'Mid-Tier 10k–200k',
  macro: 'Macro 200k–1M',
  celebrity: 'Celebrity 1M+',
}

function locationLabel(c: { city?: string; country?: string; location?: string }) {
  return [c.city, c.country].filter(Boolean).join(', ') || c.location || ''
}

function statusLabel(s: string) {
  if (s === 'fell_through') return 'Fell Through'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getLinkLabel(url: string): string {
  if (url.includes('tiktok.com')) return 'TikTok'
  if (url.includes('instagram.com')) return 'Instagram'
  if (url.includes('drive.google.com') || url.includes('docs.google.com')) return 'Drive'
  if (url.includes('dropbox.com')) return 'Dropbox'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube'
  return 'Link'
}

const blankCampaign = {
  client_name: '',
  deliverables: [] as string[],
  content_links: [''],
  notes: '',
  status: 'complete',
}

export default function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [creator, setCreator] = useState<Creator | null>(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<Partial<Creator>>({})
  const [saving, setSaving] = useState(false)
  const [showAddCampaign, setShowAddCampaign] = useState(false)
  const [campaignForm, setCampaignForm] = useState(blankCampaign)
  const [savingCampaign, setSavingCampaign] = useState(false)

  useEffect(() => {
    fetch(`/api/creators/${id}`).then(r => r.json()).then(data => {
      setCreator(data)
      setEditForm(data)
    })
  }, [id])

  async function saveEdit() {
    setSaving(true)
    // Keep the free-text `location` fallback (used by Hermes' Telegram
    // replies and the roster cards) in sync with whatever city/country were
    // just typed, instead of leaving it stale.
    const payload = { ...editForm, location: [editForm.city, editForm.country].filter(Boolean).join(', ') }
    const res = await fetch(`/api/creators/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setCreator(data)
    setEditing(false)
    setSaving(false)
  }

  async function saveCampaign() {
    setSavingCampaign(true)
    const links = campaignForm.content_links.filter(l => l.trim())
    const res = await fetch(`/api/creators/${id}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...campaignForm, content_links: links }),
    })
    const newCampaign = await res.json()
    setCreator(c => c ? { ...c, creator_campaigns: [newCampaign, ...c.creator_campaigns] } : c)
    setCampaignForm(blankCampaign)
    setShowAddCampaign(false)
    setSavingCampaign(false)
  }

  function toggleDeliverable(d: string) {
    setCampaignForm(f => ({
      ...f,
      deliverables: f.deliverables.includes(d) ? f.deliverables.filter(x => x !== d) : [...f.deliverables, d],
    }))
  }

  function toggleEditCategory(cat: string) {
    setEditForm(f => ({
      ...f,
      categories: f.categories?.includes(cat) ? f.categories.filter(c => c !== cat) : [...(f.categories ?? []), cat],
    }))
  }

  if (!creator) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-[#E5E5E5] rounded w-24" />
          <div className="h-8 bg-[#E5E5E5] rounded w-64" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Back */}
      <Link href="/creators" className="font-mono text-xs uppercase tracking-widest text-neutral-400 hover:text-black flex items-center gap-1.5 mb-6 w-fit">
        ← Creators
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`font-mono text-xs uppercase tracking-widest px-2.5 py-1 rounded-full ${STATUS_STYLES[creator.status] ?? 'bg-[#D5D5D5] text-black'}`}>
              {statusLabel(creator.status)}
            </span>
            {creator.tier && (
              <span className="font-mono text-xs uppercase tracking-widest text-neutral-400">{TIER_LABEL[creator.tier]}</span>
            )}
          </div>
          <h1 className="text-4xl font-bold text-black leading-tight">{creator.name}</h1>
          {locationLabel(creator) && <p className="text-neutral-500 text-sm mt-1">{locationLabel(creator)}{creator.gender ? ` · ${creator.gender}` : ''}</p>}
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button onClick={saveEdit} disabled={saving} className="bg-[#EF22DA] text-black text-sm font-semibold px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-40">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => { setEditing(false); setEditForm(creator) }} className="text-sm text-neutral-500 hover:text-black px-3 py-2">
                Cancel
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="bg-white border border-[#D5D5D5] text-black text-sm font-medium px-4 py-2 rounded-lg hover:border-black transition-colors">
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left sidebar */}
        <div className="col-span-1 space-y-4">

          {/* Platforms */}
          <div className="bg-white border border-[#D5D5D5] rounded-xl p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-neutral-400 mb-3">Platforms</p>
            <div className="space-y-3">
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">IG Handle</label>
                    <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.ig_handle ?? ''} onChange={e => setEditForm(f => ({ ...f, ig_handle: e.target.value }))} placeholder="@handle" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">IG Followers</label>
                    <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.ig_followers ?? ''} onChange={e => setEditForm(f => ({ ...f, ig_followers: e.target.value }))} placeholder="62.2k" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">TikTok Handle</label>
                    <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.tt_handle ?? ''} onChange={e => setEditForm(f => ({ ...f, tt_handle: e.target.value }))} placeholder="@handle" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">TikTok Followers</label>
                    <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.tt_followers ?? ''} onChange={e => setEditForm(f => ({ ...f, tt_followers: e.target.value }))} placeholder="94.4k" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">YouTube Handle</label>
                    <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.yt_handle ?? ''} onChange={e => setEditForm(f => ({ ...f, yt_handle: e.target.value }))} placeholder="@channel" />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 block mb-1">YouTube Followers</label>
                    <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.yt_followers ?? ''} onChange={e => setEditForm(f => ({ ...f, yt_followers: e.target.value }))} placeholder="10k" />
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {creator.ig_handle ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-neutral-400 uppercase">IG</span>
                      <a href={`https://instagram.com/${creator.ig_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-[#EF22DA] transition-colors">
                        {creator.ig_handle}
                      </a>
                      {creator.ig_followers && <span className="text-xs text-neutral-400">{creator.ig_followers}</span>}
                    </div>
                  ) : null}
                  {creator.tt_handle ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-neutral-400 uppercase">TT</span>
                      <a href={`https://tiktok.com/@${creator.tt_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-[#EF22DA] transition-colors">
                        {creator.tt_handle}
                      </a>
                      {creator.tt_followers && <span className="text-xs text-neutral-400">{creator.tt_followers}</span>}
                    </div>
                  ) : null}
                  {creator.yt_handle ? (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-neutral-400 uppercase">YT</span>
                      <a href={`https://youtube.com/@${creator.yt_handle.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:text-[#EF22DA] transition-colors">
                        {creator.yt_handle}
                      </a>
                      {creator.yt_followers && <span className="text-xs text-neutral-400">{creator.yt_followers}</span>}
                    </div>
                  ) : null}
                  {!creator.ig_handle && !creator.tt_handle && !creator.yt_handle && (
                    <p className="text-sm text-neutral-400">No platforms added yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Contact */}
          <div className="bg-white border border-[#D5D5D5] rounded-xl p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-neutral-400 mb-3">Contact</p>
            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Email</label>
                  <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.email ?? ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Phone</label>
                  <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.phone ?? ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">City</label>
                  <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" placeholder="e.g. New York" value={editForm.city ?? ''} onChange={e => setEditForm(f => ({ ...f, city: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Country</label>
                  <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" placeholder="e.g. USA" value={editForm.country ?? ''} onChange={e => setEditForm(f => ({ ...f, country: e.target.value }))} />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Gender</label>
                  <select className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.gender ?? ''} onChange={e => setEditForm(f => ({ ...f, gender: e.target.value }))}>
                    <option value="">—</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="non-binary">Non-binary</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Tier</label>
                  <select className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.tier ?? ''} onChange={e => setEditForm(f => ({ ...f, tier: e.target.value }))}>
                    {TIERS.map(t => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-neutral-400 block mb-1">Status</label>
                  <select className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-black" value={editForm.status ?? ''} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {creator.email && <p className="text-sm"><a href={`mailto:${creator.email}`} className="hover:text-[#EF22DA] transition-colors">{creator.email}</a></p>}
                {creator.phone && <p className="text-sm text-neutral-600">{creator.phone}</p>}
                {!creator.email && !creator.phone && <p className="text-sm text-neutral-400">No contact info.</p>}
              </div>
            )}
          </div>

          {/* Rates */}
          <div className="bg-white border border-[#D5D5D5] rounded-xl p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-neutral-400 mb-3">Rates</p>
            {editing ? (
              <textarea className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black resize-none" rows={3} placeholder="e.g. $1,500/reel, $500/story" value={editForm.rate_notes ?? ''} onChange={e => setEditForm(f => ({ ...f, rate_notes: e.target.value }))} />
            ) : (
              <p className="text-sm text-neutral-600">{creator.rate_notes || <span className="text-neutral-400">No rates added yet.</span>}</p>
            )}
          </div>

          {/* Categories */}
          <div className="bg-white border border-[#D5D5D5] rounded-xl p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-neutral-400 mb-3">Categories</p>
            {editing ? (
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleEditCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      editForm.categories?.includes(cat)
                        ? 'bg-black text-white border-black'
                        : 'bg-white text-black border-[#D5D5D5] hover:border-black'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            ) : creator.categories?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {creator.categories.map(cat => (
                  <span key={cat} className="bg-[#F2F2F2] text-neutral-600 text-xs px-2.5 py-1 rounded-full">{cat}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-400">No categories.</p>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white border border-[#D5D5D5] rounded-xl p-5">
            <p className="font-mono text-xs uppercase tracking-widest text-neutral-400 mb-3">Notes</p>
            {editing ? (
              <textarea className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black resize-none" rows={4} value={editForm.notes ?? ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            ) : (
              <p className="text-sm text-neutral-600 whitespace-pre-wrap">{creator.notes || <span className="text-neutral-400">No notes yet.</span>}</p>
            )}
          </div>
        </div>

        {/* Right — work history */}
        <div className="col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">Work History</p>
            <button onClick={() => setShowAddCampaign(!showAddCampaign)} className="bg-[#EF22DA] text-black text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
              + Add Work
            </button>
          </div>

          {/* Add campaign form */}
          {showAddCampaign && (
            <div className="bg-white border border-[#D5D5D5] rounded-xl p-5">
              <h3 className="font-bold text-sm mb-4">Add Work</h3>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="font-mono text-xs uppercase tracking-widest text-neutral-400 block mb-1.5">Client</label>
                  <input className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black" placeholder="e.g. TAXIBOX" value={campaignForm.client_name} onChange={e => setCampaignForm(f => ({ ...f, client_name: e.target.value }))} />
                </div>
                <div>
                  <label className="font-mono text-xs uppercase tracking-widest text-neutral-400 block mb-1.5">Status</label>
                  <select className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black" value={campaignForm.status} onChange={e => setCampaignForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="complete">Complete</option>
                    <option value="fell_through">Fell Through</option>
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="font-mono text-xs uppercase tracking-widest text-neutral-400 block mb-2">Deliverables</label>
                <div className="flex flex-wrap gap-2">
                  {DELIVERABLES.map(d => (
                    <button
                      key={d}
                      onClick={() => toggleDeliverable(d)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        campaignForm.deliverables.includes(d)
                          ? 'bg-black text-white border-black'
                          : 'bg-white text-black border-[#D5D5D5] hover:border-black'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="font-mono text-xs uppercase tracking-widest text-neutral-400 block mb-2">Content Links</label>
                <div className="space-y-2">
                  {campaignForm.content_links.map((link, i) => (
                    <div key={i} className="flex gap-2">
                      <input
                        className="flex-1 bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black"
                        placeholder="https://www.tiktok.com/..."
                        value={link}
                        onChange={e => {
                          const links = [...campaignForm.content_links]
                          links[i] = e.target.value
                          setCampaignForm(f => ({ ...f, content_links: links }))
                        }}
                      />
                      {campaignForm.content_links.length > 1 && (
                        <button
                          onClick={() => setCampaignForm(f => ({ ...f, content_links: f.content_links.filter((_, j) => j !== i) }))}
                          className="text-neutral-400 hover:text-black text-sm px-2"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setCampaignForm(f => ({ ...f, content_links: [...f.content_links, ''] }))}
                    className="text-xs text-neutral-500 hover:text-black"
                  >
                    + Add another link
                  </button>
                </div>
              </div>

              <div className="mb-5">
                <label className="font-mono text-xs uppercase tracking-widest text-neutral-400 block mb-1.5">Notes</label>
                <textarea className="w-full bg-[#F2F2F2] border border-[#D5D5D5] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black resize-none" rows={2} value={campaignForm.notes} onChange={e => setCampaignForm(f => ({ ...f, notes: e.target.value }))} />
              </div>

              <div className="flex gap-3">
                <button onClick={saveCampaign} disabled={savingCampaign} className="bg-[#EF22DA] text-black text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40 hover:opacity-90">
                  {savingCampaign ? 'Saving...' : 'Save Work'}
                </button>
                <button onClick={() => { setShowAddCampaign(false); setCampaignForm(blankCampaign) }} className="text-sm text-neutral-500 hover:text-black">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Campaign cards */}
          {creator.creator_campaigns?.length === 0 ? (
            <div className="bg-white border border-[#D5D5D5] rounded-xl p-8 text-center">
              <p className="text-neutral-400 text-sm">No work history yet.</p>
              <button onClick={() => setShowAddCampaign(true)} className="mt-2 text-[#EF22DA] text-sm font-semibold hover:opacity-80">
                Add their first campaign →
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {creator.creator_campaigns?.map(campaign => (
                <div key={campaign.id} className="bg-white border border-[#D5D5D5] rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-bold text-sm">{campaign.client_name || 'No client'}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{new Date(campaign.created_at).toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })}</p>
                    </div>
                    <span className={`font-mono text-xs uppercase tracking-widest px-2.5 py-1 rounded-full ${
                      campaign.status === 'active' ? 'bg-[#EF22DA] text-black' :
                      campaign.status === 'complete' ? 'bg-[#D5D5D5] text-black' :
                      'bg-[#E5E5E5] text-neutral-400'
                    }`}>
                      {campaign.status === 'fell_through' ? 'Fell Through' : campaign.status}
                    </span>
                  </div>

                  {campaign.deliverables?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {campaign.deliverables.map(d => (
                        <span key={d} className="bg-black text-white text-xs px-2.5 py-1 rounded-full">{d}</span>
                      ))}
                    </div>
                  )}

                  {campaign.content_links?.filter(l => l).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {campaign.content_links.filter(l => l).map((link, i) => (
                        <a
                          key={i}
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-[#EF22DA]/10 text-[#EF22DA] text-xs px-2.5 py-1 rounded-full hover:bg-[#EF22DA]/20 transition-colors font-medium"
                        >
                          {getLinkLabel(link)} ↗
                        </a>
                      ))}
                    </div>
                  )}

                  {campaign.notes && (
                    <p className="text-sm text-neutral-500">{campaign.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
