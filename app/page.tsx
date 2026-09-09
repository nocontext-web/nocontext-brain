import Link from 'next/link'
import { getSupabase } from '@/lib/supabase'
import { monthlyValue, revenueSummary, RevenueClient } from '@/lib/revenue'

export const dynamic = 'force-dynamic'
const money = (amount: number) => `$${amount.toLocaleString('en-AU', { maximumFractionDigits: 0 })}`

export default async function Overview() {
  let clients: RevenueClient[] = []
  let error = false
  try {
    const result = await getSupabase().from('clients').select('id, name, status, monthly_value, next_action').order('name')
    if (result.error) throw result.error
    clients = result.data ?? []
  } catch { error = true }
  const summary = revenueSummary(clients)
  const nextMoves = clients.filter(c => c.next_action && (!c.status || ['active', 'prospect'].includes(c.status)))
  const portfolio = [...summary.active].sort((a, b) => (monthlyValue(b) ?? -1) - (monthlyValue(a) ?? -1))
  return (
    <div className="min-h-full bg-[#f7f7f5] text-[#202020]">
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-12 md:py-14">
        <header className="flex flex-wrap items-end justify-between gap-5 border-b border-black/10 pb-8">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#a22487]">NO CONTEXT / Business</p><h1 className="mt-4 text-4xl font-medium tracking-tight md:text-5xl">The agency, at a glance.</h1><p className="mt-3 text-sm text-black/50">Clients, monthly retainers, and the next move.</p></div>
          <Link href="/clients" className="rounded-full bg-[#202020] px-5 py-3 text-xs font-medium text-white hover:bg-[#a22487]">Manage clients ↗</Link>
        </header>
        {error ? <section role="alert" className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="font-medium">Client data is unavailable.</h2><p className="mt-2 text-sm text-black/60">Revenue totals are hidden until the connection is restored. Your saved clients have not been changed.</p><Link href="/settings" className="mt-4 inline-block text-sm underline">Check connection settings</Link></section> : <>
          <section aria-label="Retainer overview" className="grid gap-4 py-8 md:grid-cols-3">
            <div className="rounded-2xl bg-[#202020] p-7 text-white"><p className="text-xs text-white/60">Contracted monthly retainers</p><p className="mt-5 text-4xl tracking-tight">{money(summary.contracted)}</p><p className="mt-5 text-xs text-white/60">Active clients only · not cash collected</p></div>
            <div className="rounded-2xl border border-black/10 bg-white p-7"><p className="text-xs text-black/50">Active clients</p><p className="mt-5 text-4xl tracking-tight">{summary.active.length}</p><p className="mt-5 text-xs text-black/50">{summary.missing ? `${summary.missing} missing a monthly retainer value` : 'All active retainer values recorded'}</p></div>
            <div className="rounded-2xl border border-black/10 bg-white p-7"><p className="text-xs text-black/50">Potential monthly retainers</p><p className="mt-5 text-4xl tracking-tight">{money(summary.pipeline)}</p><p className="mt-5 text-xs text-black/50">{summary.prospects.length} prospects · unweighted, not contracted</p></div>
          </section>
          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            <section className="overflow-hidden rounded-2xl border border-black/10 bg-white">
              <div className="flex items-center justify-between border-b border-black/10 p-6"><h2 className="text-base font-medium">Your client portfolio</h2><span className="text-[10px] uppercase tracking-widest text-black/40">Active</span></div>
              {!portfolio.length ? <p className="p-6 text-sm text-black/50">No active clients yet. Add your first client to start tracking retainers.</p> : <div className="divide-y divide-black/5">{portfolio.map(client => <Link key={client.id} href={`/clients/${client.id}`} className="block p-6 hover:bg-[#faf7fa]"><div className="flex justify-between gap-4"><span className="font-medium">{client.name}</span><span className="text-sm">{monthlyValue(client) == null ? 'Not recorded' : `${money(monthlyValue(client)!)} / mo`}</span></div>{summary.contracted > 0 && <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/5"><div className="h-full rounded-full bg-[#b54898]" style={{ width: `${((monthlyValue(client) ?? 0) / summary.contracted) * 100}%` }} /></div>}</Link>)}</div>}
            </section>
            <section><h2 className="mb-5 text-base font-medium">Next moves</h2>{nextMoves.length ? <div className="space-y-3">{nextMoves.slice(0, 8).map(client => <Link key={client.id} href={`/clients/${client.id}`} className="block rounded-xl border border-black/10 bg-white p-5 hover:border-[#b54898]"><p className="text-[10px] uppercase tracking-widest text-[#a22487]">{client.name}</p><p className="mt-2 text-sm leading-relaxed">{client.next_action}</p></Link>)}</div> : <p className="text-sm leading-relaxed text-black/50">No next actions recorded. Add them on a client page when there is a clear next step.</p>}</section>
          </div>
        </>}
        <footer className="mt-12 flex flex-wrap justify-between gap-4 border-t border-black/10 pt-5 text-xs text-black/45"><p>Talk to Caspar in Slack. Check the business here.</p><details><summary className="cursor-pointer">Creative tools</summary><div className="mt-3 flex gap-4"><Link href="/research">Research</Link><Link href="/references">References</Link><Link href="/creators">Creators</Link></div></details></footer>
      </div>
    </div>
  )
}
