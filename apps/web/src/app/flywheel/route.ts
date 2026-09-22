import { NextResponse } from 'next/server';

/** Stable short link → docs §24 creator-rewards flywheel (hash must be preserved). */
const FLYWHEEL_DOCS_PATH = '/docs';
const FLYWHEEL_DOCS_HASH = '24-creator-rewards-power-stronger-markets';

export function GET(request: Request) {
  const destination = new URL(FLYWHEEL_DOCS_PATH, request.url);
  destination.hash = FLYWHEEL_DOCS_HASH;
  return NextResponse.redirect(destination, 308);
}
