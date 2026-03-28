// Scrolling encrypted ticker band
export default function CryptoTicker() {
  const chars = '0x7a3f · 0xe91b · zk_verify · ◈ · shield_active · 0xd4a8 · ▓▒░ · proof_valid · 0x2dd4 · epoch_847 · ◈ · encrypted · 0xf59e · batch_exec · ◈ · shielded_route · 0x34d3 · dark_match · ▓▒░ · 0xef44 · '

  return (
    <div className="h-[29px] border-b border-border bg-void/50 overflow-hidden flex items-center">
      <div className="crypto-line flex-1">
        <span className="crypto-line-inner">
          {chars.repeat(4)}
        </span>
      </div>
    </div>
  )
}
