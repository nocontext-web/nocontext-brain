import Link from 'next/link'
import { AGENT_KEYS, AGENT_META } from '@/lib/agents'

export default function AgentsPage() {
  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-7 pt-7 pb-5 border-b border-black/[0.07]">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-1">NO CONTEXT</p>
        <h1 className="text-xl font-semibold text-[#1c1c1e] tracking-tight">Agents</h1>
        <p className="text-[#6c6c70] text-sm mt-1">Edit prompts, manage memory. Changes sync to Slack.</p>
      </div>
      <div className="p-6 max-w-xl flex flex-col gap-2">
        {AGENT_KEYS.map((key, i) => {
          const meta = AGENT_META[key]
          return (
            <Link
              key={key}
              href={`/agents/${key}`}
              className="group flex items-center gap-4 p-4 bg-white border border-black/[0.07] rounded-xl hover:border-black/[0.15] hover:bg-black/[0.04] transition-all animate-fade-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="text-xl">{meta.emoji}</div>
              <div className="flex-1">
                <div className="font-medium text-[#1c1c1e] text-sm mb-0.5">{meta.name}</div>
                <div className="text-xs text-[#6c6c70]">{meta.role}</div>
              </div>
              <div className="text-[#8e8e93] group-hover:text-[#EF22DA] transition-colors text-sm">→</div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
