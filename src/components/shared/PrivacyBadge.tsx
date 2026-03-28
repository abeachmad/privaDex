import { Shield, ShieldCheck, ShieldAlert, Lock } from 'lucide-react'

type Level = 'full' | 'high' | 'standard' | 'shielded'

interface Props {
  level: Level
  size?: 'sm' | 'md'
  showLabel?: boolean
}

const config: Record<Level, { icon: typeof Shield; label: string; color: string; bg: string }> = {
  full: { icon: ShieldCheck, label: 'Full Privacy', color: 'text-emerald', bg: 'bg-emerald-ghost' },
  high: { icon: Shield, label: 'High Privacy', color: 'text-cyan', bg: 'bg-cyan-muted' },
  standard: { icon: ShieldAlert, label: 'Standard', color: 'text-gold', bg: 'bg-gold-muted' },
  shielded: { icon: Lock, label: 'Shielded', color: 'text-emerald', bg: 'bg-emerald-ghost' },
}

export default function PrivacyBadge({ level, size = 'sm', showLabel = true }: Props) {
  const c = config[level]
  const Icon = c.icon
  const iconSize = size === 'sm' ? 12 : 14

  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md ${c.bg} ${size === 'md' ? 'px-3 py-1.5' : ''}`}>
      <Icon size={iconSize} className={c.color} />
      {showLabel && (
        <span className={`font-mono text-[10px] uppercase tracking-wider ${c.color}`}>
          {c.label}
        </span>
      )}
    </div>
  )
}
