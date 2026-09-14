import { ImageResponse } from 'next/og';
import { loadOgLogoDataUri } from '@/lib/media/og-safe-image';
import {
  TOKEN_OG_SIZE,
  buildTokenOgCardModel,
  buildTokenOgUnavailableModel,
  type TokenOgCardModel,
  type TokenOgUnavailableModel,
} from '@/lib/token/og-card';
import { loadTokenOgTemplateDataUri } from '@/lib/token/og-template';
import { loadTokenPage } from '@/lib/token/load-token-page';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const alt = 'SCOOP token market';
export const size = TOKEN_OG_SIZE;
export const contentType = 'image/png';

type Props = { params: Promise<{ address: string }> };

/**
 * Token market OG image (PNG via ImageResponse).
 * Must never 500 for crawlers: missing template / logo / token data degrade gracefully.
 */
export default async function Image({ params }: Props) {
  try {
    const { address } = await params;
    const [result, templateSrc] = await Promise.all([
      loadTokenPage(address),
      loadTokenOgTemplateDataUri(),
    ]);

    if (result.status !== 'ok') {
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
      <MarketCard
        model={model}
        templateSrc={templateSrc}
        logoSrc={logoSrc}
      />,
      { ...size },
    );
  } catch (error) {
    console.error(
      '[token-og] render failed:',
      error instanceof Error ? error.message : 'error',
    );
    try {
      const templateSrc = await loadTokenOgTemplateDataUri();
      return new ImageResponse(
        <UnavailableCard
          model={buildTokenOgUnavailableModel()}
          templateSrc={templateSrc}
        />,
        { ...size },
      );
    } catch {
      return new ImageResponse(
        <UnavailableCard
          model={buildTokenOgUnavailableModel()}
          templateSrc={null}
        />,
        { ...size },
      );
    }
  }
}

function TemplateLayer({ templateSrc }: { templateSrc: string | null }) {
  if (templateSrc) {
    return (
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
    );
  }
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: 1200,
        height: 630,
        backgroundColor: '#0B0B0B',
        backgroundImage:
          'linear-gradient(145deg, #1a120e 0%, #0B0B0B 55%, #1a0f08 100%)',
      }}
    />
  );
}

function MarketCard({
  model,
  templateSrc,
  logoSrc,
}: {
  model: TokenOgCardModel;
  templateSrc: string | null;
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
      <TemplateLayer templateSrc={templateSrc} />
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
  templateSrc: string | null;
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
      <TemplateLayer templateSrc={templateSrc} />
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
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            color: '#FC4C00',
            letterSpacing: '0.18em',
          }}
        >
          SCOOP
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 18,
            fontSize: 56,
            fontWeight: 700,
          }}
        >
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
