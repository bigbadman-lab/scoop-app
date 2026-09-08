/**
 * Public news display gate.
 * Keep false until product/legal clears public redistribution/display.
 */
export function isNewsPublicDisplayEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env.SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED ?? 'false').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

export function assertNewsPublicDisplayAllowed(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (!isNewsPublicDisplayEnabled(env)) {
    throw new Error(
      'SCOOP news public display is disabled (SCOOP_NEWS_PUBLIC_DISPLAY_ENABLED=false).',
    );
  }
}
