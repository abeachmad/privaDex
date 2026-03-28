import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, Search } from 'lucide-react'
import { TOKENS, TOKEN_LIST, Token } from '../../data/tokens'
import TokenIcon from './TokenIcon'

interface Props {
  selected: string
  onSelect: (symbol: string) => void
  exclude?: string
  label?: string
}

export default function TokenSelector({ selected, onSelect, exclude, label }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const token = TOKENS[selected]

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = TOKEN_LIST.filter(t =>
    t.symbol !== exclude &&
    (t.symbol.toLowerCase().includes(search.toLowerCase()) ||
     t.name.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div ref={ref} className="relative">
      {label && (
        <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1.5">
          {label}
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-glass-md border border-border hover:border-border-md transition-all duration-200 press-scale shrink-0"
      >
        <TokenIcon symbol={selected} size="sm" />
        <span className="font-medium text-sm text-text-primary">{token?.symbol}</span>
        <ChevronDown size={14} className={`text-text-tertiary transition-transform duration-200 ml-auto ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full mt-2 right-0 z-[60] w-[220px] bg-carbon border border-border-md rounded-xl shadow-deep overflow-hidden"
          >
            {/* Search */}
            <div className="p-3 border-b border-border">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-glass border border-border">
                <Search size={13} className="text-text-tertiary" />
                <input
                  type="text"
                  placeholder="Search token..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-transparent text-sm text-text-primary placeholder:text-text-ghost outline-none w-full"
                  autoFocus
                />
              </div>
            </div>

            {/* Token list */}
            <div className="max-h-48 overflow-y-auto no-scrollbar py-1">
              {filtered.map(t => (
                <button
                  key={t.symbol}
                  onClick={() => {
                    onSelect(t.symbol)
                    setOpen(false)
                    setSearch('')
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-glass-md transition-colors ${
                    t.symbol === selected ? 'bg-glass' : ''
                  }`}
                >
                  <TokenIcon symbol={t.symbol} size="sm" />
                  <div className="text-left">
                    <div className="text-sm font-medium text-text-primary">{t.symbol}</div>
                    <div className="text-[11px] text-text-tertiary">{t.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
