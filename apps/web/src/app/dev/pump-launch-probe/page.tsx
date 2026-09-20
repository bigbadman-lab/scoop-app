import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PumpLaunchProbeClient } from '@/components/dev/PumpLaunchProbeClient';
import { isScoopPumpProbeEnabled } from '@/lib/launch/adapters/pump/probe-flag';
import { buildPageMetadata } from '@/lib/seo/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = buildPageMetadata({
  title: 'Dev Pump probe',
  description: 'Internal SCOOP Pump.fun create build/simulate route.',
  path: '/dev/pump-launch-probe',
  indexable: false,
});

/**
 * Gate C temporary probe — Build / Simulate only. No Launch / Send.
 * Requires NEXT_PUBLIC_SCOOP_PUMP_PROBE=1.
 */
export default function PumpLaunchProbePage() {
  if (!isScoopPumpProbeEnabled()) {
    notFound();
  }
  return <PumpLaunchProbeClient />;
}
