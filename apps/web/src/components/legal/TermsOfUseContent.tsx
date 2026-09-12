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

/**
 * Formal Terms of Use copy for /legal/terms.
 * Content is authored as structured JSX (no markdown pipeline).
 */
export function TermsOfUseContent() {
  return (
    <article className="mt-8 space-y-10 text-[15px] leading-relaxed text-[var(--muted)]">
      <P>
        <strong className="font-medium text-[var(--fg)]">Last updated: 12 September 2026</strong>
      </P>

      <P>
        These Terms of Use (&quot;Terms&quot;) govern your access to and use of{' '}
        <strong className="font-medium text-[var(--fg)]">scoop.fun</strong>, the SCOOP
        interface, the SCOOP Protocol and related products, features, content and services
        (collectively, &quot;SCOOP&quot;).
      </P>

      <P>
        SCOOP is operated by <strong className="font-medium text-[var(--fg)]">Scoop Tech Ltd</strong>
        , trading as <strong className="font-medium text-[var(--fg)]">SCOOP</strong> (&quot;SCOOP&quot;,
        &quot;we&quot;, &quot;us&quot; or &quot;our&quot;), a company incorporated in the United
        Kingdom.
      </P>

      <P>
        By accessing or using SCOOP, you agree to these Terms. If you do not agree to them, you
        must not use SCOOP.
      </P>

      <Section id="about-scoop" title="1. About SCOOP">
        <P>
          SCOOP provides technology and interfaces that enable users to discover market-related
          content, interact with blockchain-based markets and digital assets, and create or
          interact with tokens and liquidity pools through the SCOOP Protocol.
        </P>
        <P>Depending on the features available at the time, SCOOP may enable users to:</P>
        <Ul>
          <li>browse financial, market and stock-related news and information;</li>
          <li>discover digital assets and markets;</li>
          <li>connect a blockchain wallet;</li>
          <li>deploy tokens and create blockchain-based markets;</li>
          <li>select eligible quote assets or pairing options;</li>
          <li>configure certain permitted economic parameters for a launch;</li>
          <li>
            buy, sell or otherwise interact with digital assets through third-party decentralised
            protocols;
          </li>
          <li>
            receive, accrue or claim creator or other protocol rewards where applicable; and
          </li>
          <li>
            access other blockchain, market-data, artificial-intelligence or related functionality.
          </li>
        </Ul>
        <P>Features may be introduced, changed, suspended or removed over time.</P>
        <P>
          SCOOP does not guarantee that any particular feature, asset, market, pairing, reward
          mechanism or blockchain network will remain available.
        </P>
      </Section>

      <Section id="eligibility" title="2. Eligibility">
        <P>
          You must be at least <strong className="font-medium text-[var(--fg)]">18 years old</strong>{' '}
          to use SCOOP.
        </P>
        <P>By using SCOOP, you represent and warrant that:</P>
        <Ul>
          <li>you have the legal capacity to enter into these Terms;</li>
          <li>your use of SCOOP is lawful in the jurisdiction in which you are located;</li>
          <li>you are not prohibited from using SCOOP under applicable law;</li>
          <li>
            you are not subject to sanctions or other restrictions that prohibit your use of the
            services; and
          </li>
          <li>you will comply with all laws and regulations applicable to your activities.</li>
        </Ul>
        <P>
          SCOOP may restrict access to all or part of the service in particular jurisdictions or for
          particular users where we consider this necessary for legal, regulatory, security or
          operational reasons.
        </P>
        <P>
          It is your responsibility to determine whether your use of SCOOP is permitted in your
          jurisdiction.
        </P>
      </Section>

      <Section id="non-custodial" title="3. Non-Custodial Technology">
        <P>
          SCOOP is designed to operate primarily as a{' '}
          <strong className="font-medium text-[var(--fg)]">non-custodial interface and protocol</strong>
          .
        </P>
        <P>
          Unless expressly stated otherwise, SCOOP does not take custody of your wallet, private
          keys or digital assets.
        </P>
        <P>When you connect a wallet, you remain responsible for:</P>
        <Ul>
          <li>safeguarding your wallet and private keys;</li>
          <li>reviewing transactions before signing them;</li>
          <li>ensuring that you are interacting with the correct network and contracts;</li>
          <li>maintaining sufficient assets to pay applicable network fees; and</li>
          <li>understanding the consequences of blockchain transactions.</li>
        </Ul>
        <P>
          We cannot recover private keys, reverse blockchain transactions or restore digital assets
          that are lost, stolen, transferred to an incorrect address or otherwise made inaccessible.
        </P>
        <P>
          Never provide your seed phrase or private key to SCOOP or to anyone claiming to represent
          SCOOP.
        </P>
      </Section>

      <Section id="blockchain-transactions" title="4. Blockchain Transactions">
        <P>
          Transactions initiated through SCOOP may be executed through smart contracts and
          third-party blockchain infrastructure.
        </P>
        <P>Blockchain transactions may be irreversible once submitted or confirmed.</P>
        <P>
          You acknowledge that transaction execution can be affected by matters outside our control,
          including:
        </P>
        <Ul>
          <li>network congestion;</li>
          <li>gas fees;</li>
          <li>blockchain reorganisations or outages;</li>
          <li>wallet software;</li>
          <li>smart-contract behaviour;</li>
          <li>liquidity;</li>
          <li>slippage;</li>
          <li>third-party protocols;</li>
          <li>oracle or market-data failures; and</li>
          <li>changes to the underlying blockchain network.</li>
        </Ul>
        <P>
          Displaying a transaction through the SCOOP interface does not guarantee that it will
          execute, settle at a particular price or complete within a particular period.
        </P>
        <P>You are responsible for reviewing transaction details before authorising a transaction.</P>
      </Section>

      <Section id="token-launches" title="5. Token Launches and User-Created Markets">
        <P>
          SCOOP may permit users to deploy tokens or establish markets using the SCOOP Protocol.
        </P>
        <P>
          Tokens and markets created through SCOOP may be created by independent users and not by
          Scoop Tech Ltd.
        </P>
        <P>
          The person initiating a launch (&quot;Deployer&quot;) is responsible for the information,
          configuration and content associated with that launch.
        </P>
        <P>A Deployer must not create or promote a token or market that:</P>
        <Ul>
          <li>is fraudulent, deceptive or materially misleading;</li>
          <li>impersonates another person, company, organisation or project;</li>
          <li>infringes intellectual property or other legal rights;</li>
          <li>falsely claims affiliation, endorsement, ownership or approval;</li>
          <li>is designed to manipulate users or markets unlawfully;</li>
          <li>facilitates unlawful activity;</li>
          <li>contains malicious code or intentionally harmful functionality; or</li>
          <li>otherwise violates applicable law or these Terms.</li>
        </Ul>
        <P>
          The availability of a token or market through SCOOP does{' '}
          <strong className="font-medium text-[var(--fg)]">not</strong> mean that SCOOP has reviewed,
          approved, endorsed or verified that token, its creator, its claims or its economic
          prospects.
        </P>
      </Section>

      <Section id="pairing" title="6. Pairing With Stock Tokens and Other Quote Assets">
        <P>
          SCOOP may permit tokens to be paired with various eligible quote assets, which may include
          blockchain-based assets associated with, referencing or providing exposure to stocks,
          exchange-traded funds or other financial instruments.
        </P>
        <P>
          The existence of such a pairing must not be interpreted as meaning that the SCOOP-launched
          token itself represents the underlying stock, security, company or financial instrument.
        </P>
        <P>Unless expressly stated otherwise, a token launched through SCOOP:</P>
        <Ul>
          <li>
            does not represent ownership of the company associated with a paired stock token;
          </li>
          <li>
            does not provide shareholder, voting, dividend or other rights in that company;
          </li>
          <li>
            is not issued, sponsored or endorsed by that company merely because a pairing exists;
            and
          </li>
          <li>does not necessarily track the price or performance of the paired asset.</li>
        </Ul>
        <P>
          Any rights associated with a separate stock token or other quote asset are determined by
          the issuer and terms of that asset, not by SCOOP.
        </P>
        <P>
          Users should independently understand the nature of both assets in a trading pair before
          transacting.
        </P>
      </Section>

      <Section id="fees" title="7. Fees and Launch Economics">
        <P>
          Use of SCOOP may involve protocol fees, trading fees, launch fees, creator rewards,
          deployer fees, blockchain network fees or fees charged by third-party protocols.
        </P>
        <P>
          Where a Deployer is permitted to configure certain economic parameters, those parameters
          may affect the costs incurred by users trading or interacting with that market.
        </P>
        <P>
          Relevant fees and configurable parameters should be displayed through the interface where
          reasonably practicable.
        </P>
        <P>You are responsible for reviewing them before authorising a transaction.</P>
        <P>
          Fees may change over time as the protocol or service develops, subject to the operation
          and limitations of the relevant smart contracts.
        </P>
      </Section>

      <Section id="creator-rewards" title="8. Creator Rewards">
        <P>
          Certain SCOOP markets may generate rewards or fee allocations for creators, deployers or
          other designated recipients.
        </P>
        <P>
          The availability, calculation and distribution of such rewards depend on the applicable
          smart contracts and configuration of the relevant launch.
        </P>
        <P>
          Where SCOOP permits rewards to be associated with an external identity, including a
          social-media identity, additional verification may be required before those rewards can be
          claimed.
        </P>
        <P>
          A display of estimated, accrued or pending rewards does not constitute a guarantee of
          payment.
        </P>
        <P>
          Users are responsible for any taxes, reporting obligations or other liabilities arising
          from rewards they receive.
        </P>
      </Section>

      <Section id="news-ai" title="9. News, Market Information and AI-Generated Content">
        <P>
          SCOOP may aggregate, process, rank, summarise or surface news, market information and
          other third-party content.
        </P>
        <P>
          Some content may be selected, classified, summarised or generated using automated or
          artificial-intelligence systems.
        </P>
        <P>
          SCOOP does not guarantee that this information is complete, accurate, current or
          error-free.
        </P>
        <P>
          News or information appearing on SCOOP may originate from independent third parties.
          Intellectual property in third-party material remains with the relevant rights holders.
        </P>
        <P>
          The decision by SCOOP&apos;s systems to surface a story, associate it with a company or
          asset, or make it available in connection with market functionality does not constitute an
          endorsement or recommendation.
        </P>
        <P>
          AI-generated content may contain errors, omissions or inaccurate interpretations and
          should be independently verified before being relied upon.
        </P>
      </Section>

      <Section id="no-investment-advice" title="10. No Investment Advice">
        <P>Nothing available through SCOOP constitutes:</P>
        <Ul>
          <li>investment advice;</li>
          <li>financial advice;</li>
          <li>legal advice;</li>
          <li>tax advice;</li>
          <li>brokerage services;</li>
          <li>investment management;</li>
          <li>a recommendation to purchase or sell an asset; or</li>
          <li>a guarantee regarding the future performance of any asset.</li>
        </Ul>
        <P>
          SCOOP does not assess whether a transaction or digital asset is suitable or appropriate
          for you.
        </P>
        <P>
          Any decision to create, purchase, sell, hold or otherwise interact with a digital asset is
          made by you at your own risk.
        </P>
        <P>
          You should conduct your own research and, where appropriate, obtain advice from an
          appropriately qualified independent professional.
        </P>
      </Section>

      <Section id="digital-asset-risks" title="11. Digital Asset Risks">
        <P>Digital assets and decentralised markets involve substantial risk.</P>
        <P>
          Prices may be extremely volatile, liquidity may disappear, and you may lose some or{' '}
          <strong className="font-medium text-[var(--fg)]">all of the value</strong> committed to a
          transaction.
        </P>
        <P>Risks include, but are not limited to:</P>
        <Ul>
          <li>smart-contract vulnerabilities;</li>
          <li>loss of private keys;</li>
          <li>market volatility;</li>
          <li>limited or disappearing liquidity;</li>
          <li>slippage;</li>
          <li>market manipulation;</li>
          <li>fraudulent token creators;</li>
          <li>blockchain failures;</li>
          <li>oracle failures;</li>
          <li>third-party infrastructure failures;</li>
          <li>regulatory changes;</li>
          <li>tax consequences;</li>
          <li>token issuer or counterparty risks; and</li>
          <li>technological failures.</li>
        </Ul>
        <P>
          Additional information is provided in our{' '}
          <strong className="font-medium text-[var(--fg)]">Risk Disclosure</strong>, which forms an
          important part of the information governing your use of SCOOP.
        </P>
      </Section>

      <Section id="third-party" title="12. Third-Party Services">
        <P>SCOOP relies on or interoperates with third-party technology.</P>
        <P>
          This may include blockchain networks, decentralised exchanges, liquidity protocols, wallet
          providers, RPC providers, market-data providers, social platforms, hosting providers,
          analytics services and other infrastructure.
        </P>
        <P>
          Your use of third-party services may also be governed by their own terms and privacy
          policies.
        </P>
        <P>
          We do not control independent third-party services and are not responsible for their
          availability, security, accuracy or performance.
        </P>
        <P>References or links to third-party services do not constitute an endorsement.</P>
      </Section>

      <Section id="prohibited-use" title="13. Prohibited Use">
        <P>You must not use SCOOP to:</P>
        <Ul>
          <li>violate any applicable law or regulation;</li>
          <li>commit fraud or deception;</li>
          <li>launder money or facilitate unlawful financial activity;</li>
          <li>evade sanctions or legal restrictions;</li>
          <li>manipulate markets unlawfully;</li>
          <li>distribute malware or malicious code;</li>
          <li>gain unauthorised access to systems or accounts;</li>
          <li>interfere with the operation or security of SCOOP;</li>
          <li>impersonate another person or organisation;</li>
          <li>misrepresent an affiliation with a company, issuer or project;</li>
          <li>infringe intellectual property rights;</li>
          <li>harass, threaten or harm others;</li>
          <li>
            exploit vulnerabilities in the interface or associated systems for an unlawful purpose;
            or
          </li>
          <li>
            use SCOOP in any way that could expose us, our users or our infrastructure providers to
            material legal or security risk.
          </li>
        </Ul>
        <P>
          We may restrict access to the SCOOP-operated interface where we reasonably believe these
          Terms have been violated or where restriction is required for legal, security or
          operational reasons.
        </P>
      </Section>

      <Section id="intellectual-property" title="14. Intellectual Property">
        <P>
          Unless otherwise stated, the SCOOP name, branding, interface, website design, software,
          text, graphics and other materials created by or for Scoop Tech Ltd are owned by or
          licensed to Scoop Tech Ltd and are protected by applicable intellectual-property laws.
        </P>
        <P>These Terms do not transfer ownership of SCOOP intellectual property to you.</P>
        <P>
          Open-source software and blockchain smart contracts may be subject to separate licences.
          Where applicable, those licences govern your use of that software.
        </P>
        <P>
          Third-party names, logos, trademarks, news content and other materials remain the property
          of their respective owners.
        </P>
      </Section>

      <Section id="user-content" title="15. User Content">
        <P>
          Where you submit names, descriptions, images, links, social identities or other content
          through SCOOP, you represent that you have the right to use and submit that content.
        </P>
        <P>
          You grant Scoop Tech Ltd a worldwide, non-exclusive, royalty-free licence to host,
          reproduce, display and process that content to the extent reasonably necessary to operate,
          promote and provide SCOOP.
        </P>
        <P>
          We may remove or restrict content from SCOOP-operated interfaces where we reasonably
          believe it violates these Terms, applicable law or third-party rights.
        </P>
        <P>
          Removal from an interface may not remove information or assets that have already been
          permanently recorded on a public blockchain.
        </P>
      </Section>

      <Section id="availability" title="16. Availability and Changes">
        <P>SCOOP is an evolving product.</P>
        <P>
          We may modify, update, suspend or discontinue any part of the SCOOP-operated website,
          interface or related services.
        </P>
        <P>We do not guarantee uninterrupted or error-free availability.</P>
        <P>
          Certain blockchain smart contracts may operate independently after deployment and may not
          be capable of being modified, suspended or discontinued by Scoop Tech Ltd.
        </P>
        <P>
          Nothing in these Terms should be interpreted as implying that we control blockchain
          infrastructure or decentralised smart contracts where we do not have that capability.
        </P>
      </Section>

      <Section id="security" title="17. Security">
        <P>
          We take reasonable steps to protect SCOOP-operated systems, but no software, website,
          smart contract or blockchain system can be guaranteed to be completely secure.
        </P>
        <P>
          You are responsible for maintaining appropriate security for your devices, accounts and
          wallets.
        </P>
        <P>
          If you believe you have identified a security vulnerability affecting SCOOP, please
          contact{' '}
          <a
            href="mailto:hi@scoop.fun"
            className="underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:text-[var(--fg)]"
          >
            hi@scoop.fun
          </a>{' '}
          rather than attempting to exploit it.
        </P>
      </Section>

      <Section id="taxes" title="18. Taxes">
        <P>
          You are solely responsible for determining what taxes, duties, reporting requirements or
          other governmental charges may apply to your activities through SCOOP.
        </P>
        <P>Scoop Tech Ltd does not provide tax advice.</P>
      </Section>

      <Section id="limitation-of-liability" title="19. Limitation of Liability">
        <P>
          Nothing in these Terms excludes or limits liability where doing so would be unlawful,
          including liability that cannot legally be excluded under applicable law.
        </P>
        <P>
          To the fullest extent permitted by law, Scoop Tech Ltd and its directors, officers,
          employees, contractors and affiliates will not be liable for indirect, incidental, special
          or consequential losses arising from your use of, or inability to use, SCOOP.
        </P>
        <P>This includes, where legally permitted, losses resulting from:</P>
        <Ul>
          <li>changes in digital-asset value;</li>
          <li>unsuccessful or incorrectly authorised transactions;</li>
          <li>lost private keys;</li>
          <li>smart-contract failures;</li>
          <li>insufficient liquidity or slippage;</li>
          <li>third-party services;</li>
          <li>inaccurate market, news or AI-generated information;</li>
          <li>blockchain failures;</li>
          <li>unauthorised access to a wallet or account; or</li>
          <li>actions taken by independent token creators or other users.</li>
        </Ul>
        <P>
          You acknowledge that interacting with blockchain technology and digital assets involves
          risks that cannot be eliminated by SCOOP.
        </P>
        <P>
          Nothing in these Terms affects any statutory rights you may have that cannot legally be
          waived or restricted.
        </P>
      </Section>

      <Section id="indemnity" title="20. Indemnity">
        <P>
          To the extent permitted by applicable law, you agree to indemnify Scoop Tech Ltd against
          reasonable losses, liabilities, claims and expenses arising directly from your unlawful
          use of SCOOP, your material breach of these Terms or your infringement of another
          person&apos;s rights.
        </P>
        <P>
          This provision does not require you to indemnify us for losses caused by our own fraud,
          negligence or other liability that cannot lawfully be excluded.
        </P>
      </Section>

      <Section id="suspension" title="21. Suspension and Termination">
        <P>You may stop using SCOOP at any time.</P>
        <P>
          We may suspend or restrict your access to SCOOP-operated services where reasonably
          necessary because of:
        </P>
        <Ul>
          <li>a breach of these Terms;</li>
          <li>suspected unlawful activity;</li>
          <li>security threats;</li>
          <li>legal or regulatory requirements;</li>
          <li>sanctions requirements; or</li>
          <li>material risks to SCOOP or its users.</li>
        </Ul>
        <P>
          Because public blockchains and decentralised smart contracts may operate independently,
          restricting access to the SCOOP interface does not necessarily prevent interaction with
          blockchain contracts through other means.
        </P>
      </Section>

      <Section id="privacy" title="22. Privacy">
        <P>
          Our collection and use of personal information is described in our{' '}
          <strong className="font-medium text-[var(--fg)]">Privacy Policy</strong>.
        </P>
        <P>
          Public blockchain activity is inherently transparent. Transactions involving a public
          wallet address may be permanently visible and may be analysed or associated with other
          publicly available information.
        </P>
        <P>
          You should not use a public blockchain if you are unwilling for relevant transaction
          information to become publicly accessible.
        </P>
      </Section>

      <Section id="changes" title="23. Changes to These Terms">
        <P>
          We may update these Terms as SCOOP develops or where necessary to reflect legal,
          regulatory, security or operational changes.
        </P>
        <P>
          The current version will be published on scoop.fun with its effective or last-updated date.
        </P>
        <P>
          Where a change is material, we may provide additional notice where reasonably appropriate.
        </P>
        <P>
          Your continued use of SCOOP after updated Terms become effective constitutes acceptance of
          those Terms to the extent permitted by applicable law.
        </P>
      </Section>

      <Section id="governing-law" title="24. Governing Law">
        <P>
          These Terms and any non-contractual obligations arising from them are governed by the{' '}
          <strong className="font-medium text-[var(--fg)]">laws of England and Wales</strong>.
        </P>
        <P>
          Subject to any mandatory rights you may have under applicable consumer law, the courts of{' '}
          <strong className="font-medium text-[var(--fg)]">England and Wales</strong> will have
          jurisdiction over disputes arising from or relating to these Terms or your use of SCOOP.
        </P>
      </Section>

      <Section id="general" title="25. General">
        <P>
          If any provision of these Terms is found to be invalid or unenforceable, the remaining
          provisions will continue in effect.
        </P>
        <P>
          Our failure to enforce a provision of these Terms does not waive our right to enforce it
          later.
        </P>
        <P>
          These Terms, together with the Privacy Policy, Risk Disclosure and any other terms
          expressly incorporated into them, constitute the agreement between you and Scoop Tech Ltd
          concerning your use of SCOOP.
        </P>
      </Section>

      <Section id="contact" title="26. Contact">
        <P>If you have questions about these Terms or SCOOP, contact:</P>
        <P>
          <strong className="font-medium text-[var(--fg)]">Scoop Tech Ltd</strong>
          <br />
          Trading as <strong className="font-medium text-[var(--fg)]">SCOOP</strong>
          <br />
          Email:{' '}
          <a
            href="mailto:hi@scoop.fun"
            className="underline decoration-[color-mix(in_srgb,var(--fg)_25%,transparent)] underline-offset-2 hover:text-[var(--fg)]"
          >
            hi@scoop.fun
          </a>
        </P>
      </Section>

      <aside className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-4 text-[14px] leading-relaxed">
        <p>
          <strong className="font-medium text-[var(--fg)]">Important:</strong> SCOOP involves digital
          assets, decentralised protocols and potentially highly volatile markets. Nothing on SCOOP
          is investment advice. You should understand the risks before signing any blockchain
          transaction.
        </p>
      </aside>
    </article>
  );
}
