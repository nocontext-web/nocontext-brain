'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = { href: string; label: string; icon: string }
type NavSection = { items: NavItem[] }

const sections: NavSection[] = [
  {
    items: [
      { href: '/',              label: 'Today',      icon: '◈' },
      { href: '/agents/caspar', label: 'Chat',       icon: '◐' },
    ],
  },
  {
    items: [
      { href: '/board',         label: 'Board',      icon: '⊞' },
      { href: '/clients',       label: 'Clients',    icon: '◎' },
      { href: '/creators',      label: 'Creators',   icon: '✦' },
    ],
  },
  {
    items: [
      { href: '/research',      label: 'Research',   icon: '⌕' },
      { href: '/ideate',        label: 'Ideate',     icon: '⊹' },
      { href: '/generate',      label: 'Scripts',    icon: '≡' },
      { href: '/templates',     label: 'Templates',  icon: '⊡' },
    ],
  },
  {
    items: [
      { href: '/train',         label: 'Train',      icon: '⬡' },
      { href: '/references',    label: 'References', icon: '⊟' },
      { href: '/transcribe',    label: 'Transcribe', icon: '◉' },
    ],
  },
]

const bottomItems: NavItem[] = [
  { href: '/agents',   label: 'Agents',   icon: '⚙' },
  { href: '/settings', label: 'Settings', icon: '⊘' },
]

export default function Nav() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  function NavIcon({ href, label, icon }: NavItem) {
    const active = isActive(href)
    return (
      <Link
        href={href}
        className={`flex items-center gap-2.5 w-full px-2 py-2 rounded-xl transition-colors ${
          active
            ? 'bg-white shadow-[0_1px_4px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.06)]'
            : 'hover:bg-black/[0.05]'
        }`}
      >
        <span className={`text-[13px] leading-none w-5 text-center shrink-0 ${
          active ? 'text-[#EF22DA]' : 'text-[#b0b0b5]'
        }`}>
          {icon}
        </span>
        <span
          className={`text-[12px] font-medium whitespace-nowrap overflow-hidden transition-all duration-150 ${
            active ? 'text-[#1c1c1e]' : 'text-[#6c6c70]'
          }`}
          style={{ opacity: open ? 1 : 0, maxWidth: open ? '120px' : '0px' }}
        >
          {label}
        </span>
      </Link>
    )
  }

  return (
    <nav
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      className="shrink-0 flex flex-col h-full border-r border-black/[0.07] bg-white/80 overflow-hidden"
      style={{ width: open ? '164px' : '52px', transition: 'width 180ms ease' }}
    >
      {/* Logo */}
      <div className="h-14 flex items-center border-b border-black/[0.06] shrink-0 px-3.5 gap-1.5">
        <span className="text-[#EF22DA] font-bold text-sm tracking-tight leading-none shrink-0">N°</span>
        <span
          className="text-[#EF22DA] font-bold text-sm tracking-tight leading-none whitespace-nowrap overflow-hidden transition-all duration-150"
          style={{ opacity: open ? 1 : 0, maxWidth: open ? '120px' : '0px' }}
        >
          CONTEXT
        </span>
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-0.5 px-1.5">
        {sections.map((section, si) => (
          <div key={si} className="flex flex-col gap-0.5 w-full">
            {si > 0 && <div className="h-px bg-black/[0.07] my-1.5 mx-1" />}
            {section.items.map(item => (
              <NavIcon key={item.href} {...item} />
            ))}
          </div>
        ))}
      </div>

      {/* Bottom */}
      <div className="pb-4 flex flex-col gap-0.5 px-1.5 border-t border-black/[0.06] pt-3 shrink-0">
        {bottomItems.map(item => (
          <NavIcon key={item.href} {...item} />
        ))}
      </div>
    </nav>
  )
}
