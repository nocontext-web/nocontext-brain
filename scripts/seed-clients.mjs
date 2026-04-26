import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://zcbdxyvymjfytyzisyof.supabase.co',
  'process.env.SUPABASE_SECRET_KEY'
)

const clients = [
  {
    name: 'Tokyo Headspa',
    brief: 'Premium scalp treatment clinic. 6 locations across Sydney, Melbourne, Brisbane (Bondi Junction, Surry Hills, St Leonards, Armadale, Teneriffe, West End). Contact: Carly (GM). Organic strategy + creator program + performance creative. ~$25k/month on Meta. Mostly contra collabs with select paid creators. Content used across organic, whitelisting, and ads. Booking via Zenoti and Fresha. WIPs Monday + Thursday. $3,500/month retainer.',
    website: null,
    instagram: '@tokyoheadspa',
    tiktok: null,
  },
  {
    name: 'Fig & Bloom',
    brief: 'Premium florist — online + two physical locations (Sydney, Melbourne). Organic content production + ad creative (some pieces double as paid). 30 pieces/month, 3 shoots/month. Target 10k average views per video. Running an office-style comedy series set in the flower shop — Zoe (NO CONTEXT) is the lead. $8,000/month retainer.',
    website: null,
    instagram: null,
    tiktok: null,
  },
  {
    name: 'Unyoked',
    brief: 'Premium outdoor wellness brand. Full Meta ads management focused on lead quality and geographic precision. Sydney & Melbourne postcode targeting active. Lookalike audience drift monitoring. Interactive leads map built for Laura. Contact: Laura Haddock (internal). $2,500/month retainer.',
    website: null,
    instagram: null,
    tiktok: null,
  },
  {
    name: 'Bar None',
    brief: 'Snack bar brand repositioning the category narrative. Core insight: "healthy" snack bars are mostly marketing theater — Bar None is genuinely different. Strategy: authenticity through creator testimony and problem-led storytelling. Contact: Brea (founder). Content production + creator management + Meta ads. ~$4k/month 3-month test. Hero piece + micro-creator program (3-4 creators/month at $250 each) + lo-fi bundle (8-10 pieces).',
    website: null,
    instagram: null,
    tiktok: null,
  },
  {
    name: 'Grumpy Bums',
    brief: "Kids snack brand solving the healthy-vs-tasty dilemma. Founded by Jo (food scientist, 20 years industry). Contact: Jo. Currently 2x polished brand edits/month at $450 each ($900/month). Growth pathway triggers when Woolworths distribution lands: hero video + lo-fi bundle + micro-creator program + Meta ads (~$7,800-$8,500/month at scale). Storytelling spine: Jo's journey from frustration to solution.",
    website: null,
    instagram: null,
    tiktok: null,
  },
  {
    name: 'Taxibox',
    brief: 'Storage brand. Influencer and creator partnership campaigns — contra and paid activations. Performance-oriented with paid creative reuse across platforms. Contact: Emma L (emmal@taxibox.com.au). Paid tiers: Tier 1 $1k (<20k followers), Tier 2 $1.5k (20k+), Tier 3 inbound 50% off. Contra cap $2,500. $1k/month base retainer + per-creator fees.',
    website: null,
    instagram: null,
    tiktok: null,
  },
  {
    name: 'Salt Water and Song',
    brief: 'DTC denim brand co-founded by Omer (20+ years denim expertise) and daughter Aviv. Physical kiosk at Camp Cove, Sydney. Contacts: Omer + Aviv. The Series (documentary-style weekly video, ~$2k/month) + micro-creator seeding female-focused (contra + paid $300-500 each, $1k/month management) + Meta ads Phase 2 ($1.5k/month). Founder-driven narrative, beach lifestyle, local Sydney.',
    website: null,
    instagram: null,
    tiktok: null,
  },
  {
    name: 'Mr. Katz',
    brief: 'Luxury travel concierge for high-net-worth individuals. Sells access — unlisted hotel rooms, impossible reservations, bespoke experiences money alone cannot buy. Contacts: Saul (day-to-day), Tash (founder, closes clients by phone). ICP: wealthy Australians 35-60, $100k+ per trip. Tone: confident, dry, understated — anti-hype. 20 HNW clients, targeting 30. Content pillars: The Call, Axe-style before/after ads, Door Knock BTS, Tash Explains.',
    website: 'mrkatz.com',
    instagram: null,
    tiktok: null,
  },
  {
    name: 'Mimi and Munch',
    brief: 'Pet food/treat brand, early stage. Contact: Nicky. DTC growth and retail sell-through via content + Meta ads. $3k/month retainer + ~$2k/month media spend. 4-6 videos/month: UGC, pet reactions, POV, "why we switched", in-store moments, treat ASMR. Performance-first creative. Note: budget constraints require prioritising DTC or retail velocity — not both simultaneously.',
    website: null,
    instagram: null,
    tiktok: null,
  },
  {
    name: 'Big Sam Young',
    brief: 'Pilot engagement. Contact: Sam Young. Full Meta ads management + 5 content pieces/month as ad creative. ~$100/day on Meta (~$3k/month, client-direct to Meta). Sourcing creators on contra (complimentary meals for content + usage rights). $2,500/month agency retainer. Month-to-month, no lock-in. Scope scales based on performance data.',
    website: null,
    instagram: null,
    tiktok: null,
  },
  {
    name: 'Hide & Seek',
    brief: "Not-for-profit changing the narrative around eating disorders. Quiet, narrative-driven, non-clinical — real stories and lived experience, no heavy clinical language. Contact: Jaimee (founder, personal connection through Josh). Ad-hoc creative support, project basis (not retainer). Notable collab: KIC Mirror-Free Studio campaign. Approach with care for their mission.",
    website: null,
    instagram: null,
    tiktok: null,
  },
]

const { data, error } = await supabase.from('clients').insert(clients).select('id, name')

if (error) {
  console.error('Error inserting clients:', error.message)
  process.exit(1)
}

console.log(`✓ Inserted ${data.length} clients:`)
data.forEach(c => console.log(`  - ${c.name} (${c.id})`))
