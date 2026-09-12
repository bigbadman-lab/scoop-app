import type { ReactNode } from 'react';

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-lg font-semibold tracking-tight text-[var(--fg)]">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

function Ul({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}

function MailLink() {
  return (
    <a
      href="mailto:hi@scoop.fun"
      className="underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:text-[var(--fg)]"
    >
      hi@scoop.fun
    </a>
  );
}

/**
 * Formal Disclaimer copy for /legal/disclaimer.
 * Content is authored as structured JSX (no markdown pipeline).
 */
export function DisclaimerContent() {
  return (
    <article className="mt-8 space-y-10 text-[15px] leading-relaxed text-[var(--muted)]">
      <P>
        <strong className="font-medium text-[var(--fg)]">Last updated: 12 September 2026</strong>
      </P>

      <P>
        This Disclaimer applies to <strong className="font-medium text-[var(--fg)]">scoop.fun</strong>
        , the SCOOP interface, the SCOOP Protocol and related content and services (collectively,
        &quot;SCOOP&quot;).
      </P>

      <P>
        SCOOP is operated by <strong className="font-medium text-[var(--fg)]">Scoop Tech Ltd</strong>
        , trading as <strong className="font-medium text-[var(--fg)]">SCOOP</strong>.
      </P>

      <Section id="no-advice" title="1. No Financial or Investment Advice">
        <P>
          Nothing available through SCOOP constitutes financial, investment, legal, tax or other
          professional advice.
        </P>
        <P>
          Information, data, news, analytics, charts, artificial-intelligence outputs, token
          information and other content displayed through SCOOP are provided for informational and
          technological purposes only.
        </P>
        <P>
          SCOOP does not recommend that you buy, sell, create, hold or otherwise interact with any
          digital asset.
        </P>
        <P>
          You are responsible for your own decisions and should obtain independent professional
          advice where appropriate.
        </P>
      </Section>

      <Section id="no-brokerage" title="2. No Brokerage or Investment Management">
        <P>
          SCOOP is not presented as your broker, investment adviser, portfolio manager or fiduciary.
        </P>
        <P>
          SCOOP does not determine whether a digital asset, market or transaction is suitable or
          appropriate for you.
        </P>
        <P>
          Providing an interface through which you can interact with blockchain technology does not
          constitute a recommendation to enter into any transaction.
        </P>
      </Section>

      <Section id="user-created" title="3. User-Created Tokens and Markets">
        <P>Tokens and markets accessible through SCOOP may be created by independent users.</P>
        <P>
          Unless expressly stated otherwise, Scoop Tech Ltd does not issue, sponsor, approve, endorse
          or recommend tokens merely because they were created through the SCOOP Protocol or are
          displayed through the SCOOP interface.
        </P>
        <P>
          The appearance, popularity, trading volume, ranking or prominence of a token on SCOOP
          should not be interpreted as an endorsement.
        </P>
        <P>
          Creators and deployers are responsible for the information they provide in connection with
          their launches.
        </P>
        <P>
          Always conduct your own research before interacting with a digital asset.
        </P>
      </Section>

      <Section id="stock-token-pairings" title="4. Stock-Token Pairings">
        <P>
          SCOOP may allow tokens to trade against blockchain-based assets associated with,
          referencing or providing exposure to publicly traded stocks, exchange-traded funds or other
          financial instruments.
        </P>
        <aside className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3 text-[14px] leading-relaxed text-[var(--fg)]">
          <p>
            <strong className="font-medium">
              A token being paired with a stock token does not mean that the launched token
              represents, owns or tracks the underlying stock.
            </strong>
          </p>
        </aside>
        <P>Unless expressly stated otherwise, a SCOOP-launched token does not provide:</P>
        <Ul>
          <li>shares in the associated company;</li>
          <li>ownership of the associated company;</li>
          <li>shareholder or voting rights;</li>
          <li>dividend rights; or</li>
          <li>any other rights in the underlying company or security.</li>
        </Ul>
        <P>
          A pairing does not imply sponsorship, affiliation or endorsement by the company associated
          with the paired asset.
        </P>
        <P>
          Any rights associated with a separate stock token or quote asset are determined by its
          issuer and applicable terms, not by SCOOP.
        </P>
      </Section>

      <Section id="news-not-recommendation" title="5. News Is Not a Recommendation">
        <P>
          SCOOP may identify, aggregate, rank, summarise or surface financial and market-related
          news.
        </P>
        <P>
          A story appearing on SCOOP does not mean that SCOOP believes you should trade an asset
          associated with that story.
        </P>
        <P>
          Likewise, a story being identified as relevant or being made available in connection with
          token or market creation does not constitute:
        </P>
        <Ul>
          <li>an investment recommendation;</li>
          <li>a trading signal;</li>
          <li>a prediction of future price movement;</li>
          <li>an endorsement of a resulting token; or</li>
          <li>a statement that a market should exist or has value.</li>
        </Ul>
        <P>
          <strong className="font-medium text-[var(--fg)]">
            Interesting news is not the same thing as a good investment.
          </strong>
        </P>
      </Section>

      <Section id="ai-content" title="6. AI-Generated and Automated Content">
        <P>
          SCOOP may use artificial intelligence and other automated systems to identify, classify,
          rank, associate, summarise or generate information.
        </P>
        <P>AI and automated systems can make mistakes.</P>
        <P>
          Outputs may be inaccurate, incomplete, outdated or misleading and may omit important
          context.
        </P>
        <P>
          You should independently verify information before relying on it or making a financial
          decision.
        </P>
      </Section>

      <Section id="market-data" title="7. Market and Analytics Data">
        <P>
          SCOOP may display prices, charts, trades, market capitalisation, volume, holders, creator
          earnings, rewards and other market information.
        </P>
        <P>
          This information may come from blockchain data, calculations or third-party providers.
        </P>
        <P>
          We do not guarantee that such information is accurate, complete, current or free from
          errors.
        </P>
        <P>Different platforms may calculate or present the same metric differently.</P>
        <P>SCOOP data should not be your sole basis for making a transaction.</P>
      </Section>

      <Section id="no-endorsement" title="8. No Endorsement">
        <P>
          The appearance of any company, stock, ticker, token, creator, social-media account, news
          source, project, protocol or other third party on SCOOP does not by itself imply any
          affiliation with or endorsement by Scoop Tech Ltd.
        </P>
        <P>
          Likewise, reference to a company or its stock does not imply that the company sponsors,
          approves or is affiliated with a token or market created through SCOOP.
        </P>
        <P>
          Third-party trademarks and names remain the property of their respective owners.
        </P>
      </Section>

      <Section id="third-party" title="9. Third-Party Content and Services">
        <P>
          SCOOP may display information from or interact with independent third-party services,
          including news providers, blockchain networks, decentralised protocols, wallet providers,
          market-data services, social-media platforms and other infrastructure.
        </P>
        <P>
          Scoop Tech Ltd does not control these independent services and does not guarantee their
          accuracy, availability, security or continued operation.
        </P>
        <P>Links to or integrations with third parties do not constitute endorsement.</P>
      </Section>

      <Section id="digital-asset-risk" title="10. Digital Asset Risk">
        <P>Digital assets are speculative and can be highly volatile.</P>
        <P>
          You may lose some or <strong className="font-medium text-[var(--fg)]">all of the value</strong>{' '}
          you use to acquire or interact with a digital asset.
        </P>
        <P>
          Liquidity may disappear, prices may move rapidly, smart contracts may fail and blockchain
          transactions may be irreversible.
        </P>
        <P>
          Newly created and user-created tokens may carry particularly significant risks.
        </P>
        <P>
          Before using SCOOP, you should read our{' '}
          <strong className="font-medium text-[var(--fg)]">Risk Disclosure</strong>.
        </P>
      </Section>

      <Section id="rewards" title="11. Creator, Deployer and Holder Rewards">
        <P>
          Certain markets may distribute fees or rewards to creators, deployers, holders or other
          designated recipients.
        </P>
        <P>
          The existence of these mechanisms does not constitute a promise of income, yield, profit or
          investment return.
        </P>
        <P>Reward amounts may vary and may be zero.</P>
        <P>
          People receiving fees or rewards may have financial incentives that differ from those of
          traders or token holders.
        </P>
      </Section>

      <Section id="no-guarantee" title="12. No Guarantee of Availability or Performance">
        <P>SCOOP is evolving technology.</P>
        <P>
          We do not guarantee that the website, interface, protocol, markets, integrations or other
          functionality will always be available or operate without interruption or error.
        </P>
        <P>Scoop Tech Ltd does not guarantee:</P>
        <Ul>
          <li>the success of any token launch;</li>
          <li>the value or performance of any digital asset;</li>
          <li>continued liquidity;</li>
          <li>the availability of buyers or sellers;</li>
          <li>any level of trading activity;</li>
          <li>any level of creator or holder rewards; or</li>
          <li>any financial outcome from using SCOOP.</li>
        </Ul>
      </Section>

      <Section id="your-responsibility" title="13. Your Decisions, Your Responsibility">
        <P>You are responsible for understanding any transaction before you authorise it.</P>
        <P>
          Before interacting with a digital asset, consider the asset itself, its creator or issuer,
          its liquidity, ownership concentration, fees, smart-contract risks, paired asset and the
          possibility of a complete loss.
        </P>
        <P>Do not sign a blockchain transaction that you do not understand.</P>
      </Section>

      <Section id="further-information" title="14. Further Information">
        <P>
          This Disclaimer is a summary of important limitations and does not replace SCOOP&apos;s
          full legal documentation.
        </P>
        <P>Your use of SCOOP is also subject to our:</P>
        <Ul>
          <li>
            <strong className="font-medium text-[var(--fg)]">Terms of Use</strong>
          </li>
          <li>
            <strong className="font-medium text-[var(--fg)]">Privacy Policy</strong>
          </li>
          <li>
            <strong className="font-medium text-[var(--fg)]">Risk Disclosure</strong>
          </li>
        </Ul>
        <P>
          You should read those documents before using blockchain functionality through SCOOP.
        </P>
      </Section>

      <Section id="contact" title="15. Contact">
        <P>If you have questions about this Disclaimer, contact:</P>
        <P>
          <strong className="font-medium text-[var(--fg)]">Scoop Tech Ltd</strong>
          <br />
          Trading as <strong className="font-medium text-[var(--fg)]">SCOOP</strong>
          <br />
          Email: <MailLink />
        </P>
      </Section>
    </article>
  );
}
