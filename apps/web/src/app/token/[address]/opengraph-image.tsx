import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { loadOgLogoDataUri } from '@/lib/media/og-safe-image';
import {
  TOKEN_OG_SIZE,
  buildTokenOgCardModel,
  buildTokenOgUnavailableModel,
  type TokenOgCardModel,
  type TokenOgUnavailableModel,
} from '@/lib/token/og-card';
import { loadTokenPage } from '@/lib/token/load-token-page';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const alt = 'SCOOP token market';
export const size = TOKEN_OG_SIZE;
export const contentType = 'image/png';

type Props = { params: Promise<{ address: string }> };

let templateDataUriPromise: Promise<string> | null = null;

function loadTemplateDataUri(): Promise<string> {
  if (!templateDataUriPromise) {
    templateDataUriPromise = readFile(
      join(process.cwd(), 'public/brand/token-template.png'),
    ).then((buf) => `data:image/png;base64,${buf.toString('base64')}`);
  }
  return templateDataUriPromise;
}

export default async function Image({ params }: Props) {
  const { address } = await params;
  const result = await loadTokenPage(address);

  if (result.status === 'invalid' || result.status === 'not_found') {
    notFound();
  }

  const templateSrc = await loadTemplateDataUri();

  if (result.status === 'unavailable') {
    return new ImageResponse(
      <UnavailableCard
        model={buildTokenOgUnavailableModel()}
        templateSrc={templateSrc}
      />,
      { ...size },
    );
  }

  const model = buildTokenOgCardModel({
    token: result.token,
    quotePairLabel: result.quotePairLabel,
  });
  const logoSrc = await loadOgLogoDataUri(model.logoCandidateUrl);

  return new ImageResponse(
    <MarketCard model={model} templateSrc={templateSrc} logoSrc={logoSrc} />,
    { ...size },
  );
}

function MarketCard({
  model,
  templateSrc,
  logoSrc,
}: {
  model: TokenOgCardModel;
  templateSrc: string;
  logoSrc: string | null;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        color: '#ffffff',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <img
        alt=""
        src={templateSrc}
        width={1200}
        height={630}
        style={{
          position: 'absolute',
          inset: 0,
          width: 1200,
          height: 630,
          objectFit: 'cover',
        }}
      />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          padding: '56px 64px',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <LogoBadge logoSrc={logoSrc} monogram={model.monogram} />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              maxWidth: 820,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 72,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1.05,
                color: '#FC4C00',
              }}
            >
              {model.ticker}
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 10,
                fontSize: 36,
                fontWeight: 600,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                color: '#F5F5F5',
              }}
            >
              {model.name}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              display: 'flex',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.62)',
            }}
          >
            Paired with
          </div>
          <div
            style={{
              display: 'flex',
              fontSize: 34,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
            }}
          >
            {model.pairLabel}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            width: '100%',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 16,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.55)',
              }}
            >
              Contract
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 26,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                color: 'rgba(255,255,255,0.88)',
              }}
            >
              {model.contractShort}
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 6,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: '0.2em',
                color: '#FC4C00',
              }}
            >
              SCOOP
            </div>
            <div
              style={{
                display: 'flex',
                fontSize: 22,
                color: 'rgba(255,255,255,0.78)',
              }}
            >
              {model.networkLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function UnavailableCard({
  model,
  templateSrc,
}: {
  model: TokenOgUnavailableModel;
  templateSrc: string;
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        color: '#ffffff',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <img
        alt=""
        src={templateSrc}
        width={1200}
        height={630}
        style={{
          position: 'absolute',
          inset: 0,
          width: 1200,
          height: 630,
          objectFit: 'cover',
        }}
      />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '64px',
          width: '100%',
          height: '100%',
        }}
      >
        <div style={{ display: 'flex', fontSize: 22, color: '#FC4C00', letterSpacing: '0.18em' }}>
          SCOOP
        </div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 56, fontWeight: 700 }}>
          {model.title}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 14,
            fontSize: 28,
            color: 'rgba(255,255,255,0.75)',
          }}
        >
          {model.subtitle}
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 28,
            fontSize: 22,
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          {model.networkLabel}
        </div>
      </div>
    </div>
  );
}

function LogoBadge({
  logoSrc,
  monogram,
}: {
  logoSrc: string | null;
  monogram: string;
}) {
  if (logoSrc) {
    return (
      <img
        alt=""
        src={logoSrc}
        width={168}
        height={168}
        style={{
          width: 168,
          height: 168,
          borderRadius: 28,
          objectFit: 'cover',
          border: '3px solid rgba(255,255,255,0.22)',
        }}
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        width: 168,
        height: 168,
        borderRadius: 28,
        backgroundColor: '#FC4C00',
        alignItems: 'center',
        justifyContent: 'center',
        border: '3px solid rgba(255,255,255,0.22)',
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: 72,
          fontWeight: 700,
          color: '#FFFFFF',
        }}
      >
        {monogram}
      </div>
    </div>
  );
}
