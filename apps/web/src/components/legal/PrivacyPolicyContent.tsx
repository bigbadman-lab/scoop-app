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

function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold tracking-tight text-[var(--fg)]">{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
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
 * Formal Privacy Policy copy for /legal/privacy.
 * Content is authored as structured JSX (no markdown pipeline).
 */
export function PrivacyPolicyContent() {
  return (
    <article className="mt-8 space-y-10 text-[15px] leading-relaxed text-[var(--muted)]">
      <P>
        <strong className="font-medium text-[var(--fg)]">Last updated: 12 September 2026</strong>
      </P>

      <P>
        This Privacy Policy explains how{' '}
        <strong className="font-medium text-[var(--fg)]">Scoop Tech Ltd</strong>, trading as{' '}
        <strong className="font-medium text-[var(--fg)]">SCOOP</strong> (&quot;SCOOP&quot;,
        &quot;we&quot;, &quot;us&quot; or &quot;our&quot;), collects, uses, stores and shares
        personal information when you use{' '}
        <strong className="font-medium text-[var(--fg)]">scoop.fun</strong>, the SCOOP interface and
        related services.
      </P>

      <P>
        Scoop Tech Ltd is responsible for personal information processed through the SCOOP-operated
        website and services where it acts as a data controller.
      </P>

      <P>
        This Privacy Policy does not govern information independently processed through public
        blockchains, decentralised protocols or third-party services that SCOOP does not control.
      </P>

      <P>
        If you have questions about this Privacy Policy or how we use your personal information,
        contact us at <MailLink />.
      </P>

      <Section id="information-we-may-collect" title="1. Information We May Collect">
        <P>The information we collect depends on how you use SCOOP.</P>

        <SubSection title="Account Information">
          <P>
            If SCOOP allows you to create or access an account, we may collect information associated
            with that account, such as:
          </P>
          <Ul>
            <li>email address;</li>
            <li>authentication identifiers;</li>
            <li>account identifiers;</li>
            <li>connected wallet addresses;</li>
            <li>account preferences; and</li>
            <li>
              information necessary to maintain and secure your account or session.
            </li>
          </Ul>
          <P>
            We do not need your name simply because you connect a blockchain wallet.
          </P>
        </SubSection>

        <SubSection title="Wallet Information">
          <P>
            When you connect a blockchain wallet or interact with blockchain functionality through
            SCOOP, we may process:
          </P>
          <Ul>
            <li>your public wallet address;</li>
            <li>wallet connection status;</li>
            <li>blockchain network;</li>
            <li>transaction hashes;</li>
            <li>token balances relevant to SCOOP functionality;</li>
            <li>transaction and smart-contract interaction data; and</li>
            <li>other publicly available blockchain information associated with the address.</li>
          </Ul>
          <P>
            SCOOP does <strong className="font-medium text-[var(--fg)]">not</strong> require or
            collect your wallet private key or seed phrase.
          </P>
          <P>
            You should never provide a private key or seed phrase to SCOOP or anyone claiming to
            represent SCOOP.
          </P>
        </SubSection>

        <SubSection title="Blockchain Information">
          <P>Public blockchains record transactions in a publicly accessible ledger.</P>
          <P>
            Information recorded on a blockchain may include wallet addresses, transaction values,
            token holdings, smart-contract interactions and timestamps.
          </P>
          <P>
            Blockchain information may be permanent and cannot necessarily be changed or deleted by
            Scoop Tech Ltd.
          </P>
          <P>
            Although a wallet address does not necessarily identify an individual by itself, it may
            become personal data where it can reasonably be linked to an identifiable person.
          </P>
        </SubSection>

        <SubSection title="Token Launch and Market Information">
          <P>
            If you create a token or market through SCOOP, we may process information associated with
            that launch, including:
          </P>
          <Ul>
            <li>public wallet address;</li>
            <li>token name and ticker;</li>
            <li>token image and description;</li>
            <li>selected pairing or quote asset;</li>
            <li>launch configuration;</li>
            <li>fee and reward configuration;</li>
            <li>creator or reward-recipient information;</li>
            <li>links or social information you submit; and</li>
            <li>relevant blockchain transactions.</li>
          </Ul>
          <P>
            Some of this information may be intentionally made public as part of the token or market
            page.
          </P>
        </SubSection>

        <SubSection title="Creator and Reward Information">
          <P>
            Where SCOOP enables creator rewards or other fee distributions, we may process
            information necessary to identify the intended recipient and facilitate a claim.
          </P>
          <P>Depending on the feature, this may include:</P>
          <Ul>
            <li>wallet addresses;</li>
            <li>social-media usernames or handles;</li>
            <li>stable platform-specific user identifiers;</li>
            <li>verification information;</li>
            <li>claim status;</li>
            <li>reward balances;</li>
            <li>blockchain transaction information; and</li>
            <li>
              information required to establish that a claimant controls the relevant account or
              wallet.
            </li>
          </Ul>
          <P>
            Where a social-media identity is selected as a reward recipient, SCOOP may store a
            platform-specific identifier so that the intended recipient can be identified even if
            their public username later changes.
          </P>
          <P>
            We aim to collect only the information reasonably necessary to operate and secure the
            relevant reward mechanism.
          </P>
        </SubSection>

        <SubSection title="Information From Third-Party Accounts">
          <P>
            If you choose to connect or verify an account from a third-party service, such as a
            social-media platform, that service may provide us with information authorised through
            the relevant connection.
          </P>
          <P>
            The information available depends on the permissions you grant and the third party&apos;s
            policies.
          </P>
          <P>We do not receive your third-party account password.</P>
        </SubSection>

        <SubSection title="Usage and Technical Information">
          <P>
            When you visit or use scoop.fun, we may automatically collect certain technical
            information, such as:
          </P>
          <Ul>
            <li>IP address;</li>
            <li>browser and device type;</li>
            <li>operating system;</li>
            <li>pages viewed;</li>
            <li>referring pages;</li>
            <li>approximate location derived from IP address;</li>
            <li>timestamps;</li>
            <li>interaction and performance data;</li>
            <li>session identifiers; and</li>
            <li>diagnostic or error information.</li>
          </Ul>
          <P>We use this information to operate, secure, understand and improve SCOOP.</P>
        </SubSection>

        <SubSection title="Communications">
          <P>
            If you contact us, we may collect your email address and the contents of your
            communication, together with any information you choose to provide.
          </P>
        </SubSection>
      </Section>

      <Section id="how-we-use-information" title="2. How We Use Information">
        <P>We may use personal information to:</P>
        <Ul>
          <li>provide and operate SCOOP;</li>
          <li>authenticate users and maintain sessions;</li>
          <li>connect accounts with wallet addresses where requested;</li>
          <li>display relevant blockchain information;</li>
          <li>enable token launches and market functionality;</li>
          <li>operate creator-reward and claim mechanisms;</li>
          <li>verify entitlement to rewards;</li>
          <li>provide news, market and other product functionality;</li>
          <li>respond to questions and support requests;</li>
          <li>detect and prevent fraud, abuse and security incidents;</li>
          <li>investigate violations of our Terms of Use;</li>
          <li>maintain and improve the reliability of SCOOP;</li>
          <li>understand how SCOOP is used;</li>
          <li>comply with applicable legal and regulatory obligations;</li>
          <li>establish, exercise or defend legal claims; and</li>
          <li>develop and improve SCOOP and its features.</li>
        </Ul>
        <P>
          We will not use personal information for purposes that are incompatible with the purposes
          described in this Privacy Policy unless permitted or required by law.
        </P>
      </Section>

      <Section id="legal-bases" title="3. Legal Bases for Processing">
        <P>
          Where UK data-protection law applies, we rely on one or more lawful bases for processing
          personal information.
        </P>

        <SubSection title="Performance of a Contract">
          <P>
            We may process information where necessary to provide services you request under our
            Terms of Use.
          </P>
          <P>
            For example, this may include maintaining your account or providing functionality you
            initiate.
          </P>
        </SubSection>

        <SubSection title="Legitimate Interests">
          <P>
            We may process information where necessary for our legitimate interests or those of
            another party, provided those interests are not overridden by your rights and interests.
          </P>
          <P>These interests may include:</P>
          <Ul>
            <li>operating and improving SCOOP;</li>
            <li>securing our systems;</li>
            <li>preventing fraud and abuse;</li>
            <li>understanding product usage;</li>
            <li>providing support;</li>
            <li>maintaining reliable services; and</li>
            <li>protecting our legal rights.</li>
          </Ul>
        </SubSection>

        <SubSection title="Legal Obligations">
          <P>
            We may process information where necessary to comply with a legal or regulatory
            obligation.
          </P>
        </SubSection>

        <SubSection title="Consent">
          <P>
            Where required, we may rely on your consent, including for certain cookies, analytics
            technologies, marketing communications or third-party integrations.
          </P>
          <P>
            Where processing is based on consent, you may withdraw that consent at any time.
            Withdrawal does not affect processing that occurred lawfully before consent was
            withdrawn.
          </P>
        </SubSection>
      </Section>

      <Section id="public-blockchain-data" title="4. Public Blockchain Data">
        <P>SCOOP interacts with public blockchain technology.</P>
        <P>
          You should understand that blockchain transactions are fundamentally different from
          information stored in a conventional private database.
        </P>
        <P>When you submit a blockchain transaction, information may be:</P>
        <Ul>
          <li>publicly visible;</li>
          <li>replicated across many independent computers;</li>
          <li>retained indefinitely;</li>
          <li>indexed by third parties; and</li>
          <li>impossible for Scoop Tech Ltd to alter or delete.</li>
        </Ul>
        <P>
          Scoop Tech Ltd does not control the underlying blockchain merely because SCOOP provides an
          interface for interacting with it.
        </P>
        <P>
          A request to delete personal information from SCOOP-operated systems therefore cannot
          result in deletion of information independently and permanently recorded on a public
          blockchain where we have no ability to remove it.
        </P>
      </Section>

      <Section id="social-identities" title="5. Social Identities and Creator Rewards">
        <P>
          SCOOP may allow a creator or other reward recipient to be identified using a third-party
          social-media account.
        </P>
        <P>
          To prevent rewards becoming associated with the wrong person if a username changes, SCOOP
          may use a stable identifier supplied by the relevant platform rather than relying solely on
          the visible username.
        </P>
        <P>
          Where a recipient later claims rewards, we may require authentication or other verification
          sufficient to demonstrate control of the relevant social account.
        </P>
        <P>
          We may then associate the verified identity with a wallet address supplied for claiming
          rewards.
        </P>
        <P>
          Information used for this process will be handled in accordance with this Privacy Policy.
        </P>
      </Section>

      <Section id="news-ai" title="6. News, AI and Automated Processing">
        <P>
          SCOOP may use automated systems, including artificial intelligence, to process, classify,
          rank, summarise or surface market-related information and news.
        </P>
        <P>
          We may process product usage and submitted information through automated systems where
          necessary to provide these features.
        </P>
        <P>
          Unless expressly stated otherwise, SCOOP does not use automated decision-making that
          produces legal effects concerning you or similarly significantly affects you solely on the
          basis of personal data.
        </P>
        <P>
          If this changes, we will provide any additional information required by applicable law.
        </P>
      </Section>

      <Section id="cookies" title="7. Cookies and Similar Technologies">
        <P>SCOOP may use cookies, local storage and similar technologies to:</P>
        <Ul>
          <li>maintain sessions;</li>
          <li>remember preferences;</li>
          <li>provide security functionality;</li>
          <li>understand site usage;</li>
          <li>measure performance; and</li>
          <li>improve the service.</li>
        </Ul>
        <P>Some technologies may be strictly necessary for SCOOP to operate.</P>
        <P>
          Where required by law, non-essential cookies or similar technologies will only be used with
          your consent.
        </P>
        <P>
          If we use analytics, advertising or other non-essential technologies requiring consent, we
          will provide appropriate controls through the website.
        </P>
      </Section>

      <Section id="how-we-share" title="8. How We Share Information">
        <P>We do not sell your personal information.</P>
        <P>
          We may share information with service providers that help us operate SCOOP, such as
          providers of:
        </P>
        <Ul>
          <li>hosting and cloud infrastructure;</li>
          <li>databases;</li>
          <li>authentication;</li>
          <li>wallet connectivity;</li>
          <li>blockchain infrastructure;</li>
          <li>analytics;</li>
          <li>error monitoring;</li>
          <li>artificial-intelligence services;</li>
          <li>communications;</li>
          <li>security services; and</li>
          <li>other technical infrastructure.</li>
        </Ul>
        <P>
          These providers may process information on our behalf or, in some circumstances, as
          independent controllers under their own privacy policies.
        </P>
        <P>We may also disclose information:</P>
        <Ul>
          <li>where required by law;</li>
          <li>in response to a valid legal request;</li>
          <li>to protect the rights, property or safety of SCOOP, our users or others;</li>
          <li>in connection with suspected fraud, abuse or security incidents;</li>
          <li>in connection with legal proceedings; or</li>
          <li>
            as part of a merger, acquisition, financing, restructuring or sale of all or part of our
            business.
          </li>
        </Ul>
        <P>
          Where information is intentionally published to a blockchain or public SCOOP page, it may
          also be accessible to anyone.
        </P>
      </Section>

      <Section id="third-party-services" title="9. Third-Party Services">
        <P>
          SCOOP may integrate with or link to services operated by third parties, including wallet
          providers, blockchain networks, decentralised protocols, social-media platforms and
          market-data or news providers.
        </P>
        <P>
          Those services may collect and process information independently from Scoop Tech Ltd.
        </P>
        <P>Their processing is governed by their own terms and privacy policies.</P>
        <P>
          We encourage you to review the privacy information provided by any third-party service you
          choose to use.
        </P>
      </Section>

      <Section id="international-transfers" title="10. International Data Transfers">
        <P>
          Some of our service providers may process personal information outside the United Kingdom.
        </P>
        <P>
          Where UK data-protection law requires safeguards for an international transfer, we will use
          an appropriate legal mechanism, such as:
        </P>
        <Ul>
          <li>a UK adequacy regulation;</li>
          <li>approved contractual safeguards;</li>
          <li>the UK International Data Transfer Agreement;</li>
          <li>the UK Addendum to approved standard contractual clauses; or</li>
          <li>another lawful transfer mechanism.</li>
        </Ul>
        <P>The specific mechanism depends on the provider and destination involved.</P>
      </Section>

      <Section id="data-retention" title="11. Data Retention">
        <P>
          We retain personal information only for as long as reasonably necessary for the purposes
          for which it was collected, including to satisfy legal, accounting, security and
          dispute-resolution requirements.
        </P>
        <P>
          Retention periods vary according to the type of information and why it is processed.
        </P>
        <P>For example:</P>
        <Ul>
          <li>
            account information may be retained while an account remains active and for an
            appropriate period afterwards;
          </li>
          <li>
            security and technical logs may be retained for a limited period appropriate to their
            purpose;
          </li>
          <li>
            support communications may be retained where necessary to resolve issues or maintain
            appropriate business records; and
          </li>
          <li>
            information relevant to legal obligations or disputes may be retained for longer where
            required.
          </li>
        </Ul>
        <P>
          Information recorded on a public blockchain is subject to the characteristics of that
          blockchain and may remain publicly available indefinitely.
        </P>
      </Section>

      <Section id="data-security" title="12. Data Security">
        <P>
          We use reasonable technical and organisational measures designed to protect personal
          information against unauthorised access, loss, alteration or disclosure.
        </P>
        <P>
          However, no internet service, blockchain system or database can be guaranteed to be
          completely secure.
        </P>
        <P>
          You are responsible for protecting your own devices, accounts, passwords, wallets, private
          keys and authentication methods.
        </P>
        <P>SCOOP will never ask you to provide your wallet seed phrase or private key.</P>
      </Section>

      <Section id="your-rights" title="13. Your Data Protection Rights">
        <P>
          If UK data-protection law applies to you, you may have rights including the right to:
        </P>
        <Ul>
          <li>request access to personal information we hold about you;</li>
          <li>request correction of inaccurate information;</li>
          <li>request deletion of personal information in certain circumstances;</li>
          <li>request restriction of processing;</li>
          <li>object to certain processing;</li>
          <li>request transfer of certain information in a portable format;</li>
          <li>withdraw consent where processing is based on consent; and</li>
          <li>complain to a data-protection supervisory authority.</li>
        </Ul>
        <P>
          These rights are subject to legal limitations and may not apply in every circumstance.
        </P>
        <P>
          In particular, Scoop Tech Ltd cannot erase or alter information independently recorded on a
          public blockchain where we do not control that blockchain.
        </P>
        <P>
          To exercise a privacy right, contact <MailLink />.
        </P>
        <P>We may need to verify your identity before fulfilling a request.</P>
      </Section>

      <Section id="complaints" title="14. Complaints">
        <P>
          If you have concerns about how we handle your personal information, please contact us first
          at <MailLink /> so that we can investigate.
        </P>
        <P>
          You may also have the right to make a complaint to the{' '}
          <strong className="font-medium text-[var(--fg)]">
            Information Commissioner&apos;s Office (ICO)
          </strong>
          , the UK&apos;s data-protection regulator.
        </P>
      </Section>

      <Section id="children" title="15. Children&apos;s Privacy">
        <P>
          SCOOP is not intended for anyone under the age of{' '}
          <strong className="font-medium text-[var(--fg)]">18</strong>.
        </P>
        <P>We do not knowingly provide SCOOP to children.</P>
        <P>
          If we become aware that we have collected personal information from a person under 18 in
          circumstances where we should not have done so, we will take appropriate steps to address
          it.
        </P>
      </Section>

      <Section id="changes" title="16. Changes to This Privacy Policy">
        <P>
          We may update this Privacy Policy as SCOOP develops or where our legal, technical or
          operational practices change.
        </P>
        <P>
          The current version will be published on scoop.fun with the date it was last updated.
        </P>
        <P>
          Where changes are material, we may provide additional notice where reasonably appropriate.
        </P>
      </Section>

      <Section id="contact" title="17. Contact Us">
        <P>For questions, requests or concerns regarding privacy or personal information, contact:</P>
        <P>
          <strong className="font-medium text-[var(--fg)]">Scoop Tech Ltd</strong>
          <br />
          Trading as <strong className="font-medium text-[var(--fg)]">SCOOP</strong>
          <br />
          Email: <MailLink />
        </P>
        <P>
          When contacting us about a privacy request, please provide enough information for us to
          understand your request, but{' '}
          <strong className="font-medium text-[var(--fg)]">
            do not send your wallet private key or seed phrase
          </strong>
          .
        </P>
      </Section>
    </article>
  );
}
