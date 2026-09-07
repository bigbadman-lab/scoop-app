import {
  ASSISTED_LAUNCH_HANDOFF_KEY,
  ASSISTED_LAUNCH_MARKER,
  LAUNCH_ASSIST_HANDOFF_KEY,
  type AssistedLaunchHandoff,
  type SelectedLaunchConceptHandoff,
} from '@/lib/launch-assist/types';

/** Intermediate concept pick (Phase A → B). */
export function saveSelectedLaunchConcept(handoff: SelectedLaunchConceptHandoff): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(LAUNCH_ASSIST_HANDOFF_KEY, JSON.stringify(handoff));
}

export function readSelectedLaunchConcept(): SelectedLaunchConceptHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(LAUNCH_ASSIST_HANDOFF_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SelectedLaunchConceptHandoff;
  } catch {
    return null;
  }
}

export function clearSelectedLaunchConcept(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(LAUNCH_ASSIST_HANDOFF_KEY);
}

/** Final handoff into `/launch?assist=1`. */
export function saveAssistedLaunchHandoff(handoff: AssistedLaunchHandoff): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(ASSISTED_LAUNCH_HANDOFF_KEY, JSON.stringify(handoff));
}

export function readAssistedLaunchHandoff(): AssistedLaunchHandoff | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ASSISTED_LAUNCH_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssistedLaunchHandoff;
    if (parsed.marker !== ASSISTED_LAUNCH_MARKER) return null;
    if (!parsed.image?.previewUrl || !parsed.concept?.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearAssistedLaunchHandoff(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ASSISTED_LAUNCH_HANDOFF_KEY);
}

/** Read once and clear so manual `/launch` stays blank afterward. */
export function consumeAssistedLaunchHandoff(): AssistedLaunchHandoff | null {
  const handoff = readAssistedLaunchHandoff();
  if (handoff) clearAssistedLaunchHandoff();
  return handoff;
}
