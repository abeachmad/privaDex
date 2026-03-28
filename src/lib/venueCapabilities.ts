export type VenueKey = 'amm' | 'darkpool' | 'orderbook'

export interface VenueCapability {
  enabledInRouter: boolean
  enabledForDirectExecution: boolean
  status: 'live' | 'experimental'
  shortLabel: string
  detail: string
}

export const VENUE_CAPABILITIES: Record<VenueKey, VenueCapability> = {
  amm: {
    enabledInRouter: true,
    enabledForDirectExecution: true,
    status: 'live',
    shortLabel: 'Live',
    detail: 'Immediate shielded swaps and LP operations are the executable path used by the app today.',
  },
  darkpool: {
    enabledInRouter: false,
    enabledForDirectExecution: true,
    status: 'experimental',
    shortLabel: 'Experimental',
    detail: 'Intent submission works, but settlement, claim, cancel indexing, and price verification are not automated end-to-end yet.',
  },
  orderbook: {
    enabledInRouter: false,
    enabledForDirectExecution: true,
    status: 'experimental',
    shortLabel: 'Experimental',
    detail: 'Private order submission works, but matching, fills, cancellations, and live order history are still manual or not fully indexed.',
  },
}

export function venueCapabilityReason(venue: VenueKey): string {
  return VENUE_CAPABILITIES[venue].detail
}
