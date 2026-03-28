import { TOKENS } from '../../data/tokens'

interface Props {
  symbol: string
  size?: 'sm' | 'md' | 'lg'
}

export default function TokenIcon({ symbol, size = 'md' }: Props) {
  const token = TOKENS[symbol]
  if (!token) return null

  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  }

  return (
    <div
      className={`${sizes[size]} rounded-full flex items-center justify-center shrink-0 overflow-hidden`}
      style={{ backgroundColor: `${token.color}15` }}
    >
      <img
        src={token.icon}
        alt={token.name}
        className="w-full h-full object-cover rounded-full"
      />
    </div>
  )
}
