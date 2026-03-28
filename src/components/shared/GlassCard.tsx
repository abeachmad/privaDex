import { ReactNode } from 'react'

interface Props {
  children: ReactNode
  variant?: 'default' | 'elevated' | 'bordered' | 'emerald'
  className?: string
  onClick?: () => void
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

export default function GlassCard({ children, variant = 'default', className = '', onClick, padding = 'md' }: Props) {
  const base = 'rounded-2xl transition-all duration-300'

  const variants = {
    default: 'bg-glass border border-border hover:border-border-md',
    elevated: 'bg-glass-md border border-border-md shadow-elevated',
    bordered: 'bg-transparent border border-border-md hover:border-border-lg',
    emerald: 'bg-emerald-ghost border border-emerald/10 hover:border-emerald/20',
  }

  const paddings = {
    none: '',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
  }

  return (
    <div
      className={`${base} ${variants[variant]} ${paddings[padding]} ${onClick ? 'cursor-pointer press-scale' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}
