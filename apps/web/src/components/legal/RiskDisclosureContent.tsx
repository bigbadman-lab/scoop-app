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
 * Formal Risk Disclosure copy for /legal/risk.
 * Content is authored as structured JSX (no markdown pipeline).
 */
export function RiskDisclosureContent() {
  return (
    <article className="mt-8 space-y-10 text-[15px] leading-relaxed text-[var(--muted)]">
      <P>
        <strong className="font-medium text-[var(--fg)]">Last updated: 12 September 2026</strong>
      </P>

      <P>
        This Risk Disclosure describes important risks associated with using{' '}
        <strong className="font-medium text-[var(--fg)]">scoop.fun</strong>, the SCOOP interface,
        the SCOOP Protocol and digital assets or markets accessible through them.
      </P>

      <P>
        SCOOP is operated by <strong className="font-medium text-[var(--fg)]">Scoop Tech Ltd</strong>
        , trading as <strong className="font-medium text-[var(--fg)]">SCOOP</strong> (&quot;SCOOP&quot;,
        &quot;we&quot;, &quot;us&quot; or &quot;our&quot;).
      </P>

      <aside className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-4 text-[14px] leading-relaxed text-[var(--fg)]">
        <p>
          <strong className="font-medium">
            Digital assets, decentralised markets and blockchain technology involve substantial
            risk. You may lose some or all of the assets you use through SCOOP.
          </strong>
        </p>
      </aside>

      <P>
        This disclosure cannot describe every possible risk. You should only interact with digital
        assets and blockchain transactions if you understand the relevant risks and can afford the
        potential loss.
      </P>

      <P>Nothing on SCOOP constitutes investment, financial, legal or tax advice.</P>

      <Section id="high-risk" title="1. Digital Assets Are High Risk">
        <P>Digital assets can experience extreme and unpredictable price movements.</P>
        <P>
          An asset may lose a substantial proportion of its value within a very short period and may
          become effectively worthless.
        </P>
        <P>
          Past performance, trading activity, popularity, market capitalisation, liquidity, social
          attention or association with another asset does not indicate future performance.
        </P>
        <P>You should not acquire or trade a digital asset solely because it appears on SCOOP.</P>
      </Section>

      <Section id="lose-everything" title="2. You May Lose Everything">
        <P>
          You should be prepared for the possibility of losing{' '}
          <strong className="font-medium text-[var(--fg)]">100% of the value</strong> you commit to a
          digital asset or transaction.
        </P>
        <P>
          Losses may result from price movements, insufficient liquidity, smart-contract failures,
          malicious activity, user error, blockchain problems, third-party failures or circumstances
          that neither you nor SCOOP can predict or control.
        </P>
        <P>Do not use money or digital assets that you cannot afford to lose.</P>
      </Section>

      <Section id="user-created-tokens" title="3. User-Created Tokens">
        <P>
          SCOOP may allow independent users to deploy tokens and create markets through the SCOOP
          Protocol.
        </P>
        <P>
          A token being created through SCOOP does{' '}
          <strong className="font-medium text-[var(--fg)]">not</strong> mean that Scoop Tech Ltd has:
        </P>
        <Ul>
          <li>issued the token;</li>
          <li>approved the token;</li>
          <li>endorsed the token;</li>
          <li>verified its creator;</li>
          <li>assessed its value;</li>
          <li>assessed its legality in every jurisdiction;</li>
          <li>reviewed it as an investment;</li>
          <li>guaranteed its liquidity; or</li>
          <li>guaranteed that information provided by its creator is accurate.</li>
        </Ul>
        <P>User-created tokens may have little or no fundamental value.</P>
        <P>
          A creator may abandon a project, stop communicating, sell their holdings, act against the
          interests of other holders or provide inaccurate or misleading information.
        </P>
        <P>
          You are responsible for carrying out your own assessment before interacting with a token.
        </P>
      </Section>

      <Section id="newly-launched" title="4. Newly Launched Markets">
        <P>Newly launched digital assets are particularly risky.</P>
        <P>They may have:</P>
        <Ul>
          <li>limited trading history;</li>
          <li>low liquidity;</li>
          <li>highly concentrated ownership;</li>
          <li>significant price volatility;</li>
          <li>limited information about their creator;</li>
          <li>rapidly changing market conditions; and</li>
          <li>prices that are particularly sensitive to relatively small trades.</li>
        </Ul>
        <P>
          Early trading activity should not be interpreted as evidence that a market is stable,
          legitimate or likely to retain its value.
        </P>
      </Section>

      <Section id="liquidity" title="5. Liquidity Risk">
        <P>The ability to buy an asset does not guarantee that you will later be able to sell it.</P>
        <P>Liquidity may increase or disappear rapidly.</P>
        <P>Low liquidity can result in:</P>
        <Ul>
          <li>significant slippage;</li>
          <li>poor execution prices;</li>
          <li>inability to sell the desired quantity;</li>
          <li>unusually large price movements; and</li>
          <li>substantial losses.</li>
        </Ul>
        <P>
          Liquidity may also be concentrated within particular price ranges or depend on mechanisms
          established when a market is created.
        </P>
        <P>You should understand the liquidity conditions of a market before trading.</P>
      </Section>

      <Section id="amm" title="6. Automated Market Maker Risk">
        <P>
          Markets accessible through SCOOP may use automated market makers (&quot;AMMs&quot;),
          including decentralised liquidity infrastructure.
        </P>
        <P>AMMs operate differently from traditional order-book exchanges.</P>
        <P>
          Prices are determined through smart-contract mechanisms and available liquidity rather than
          through a conventional broker or centralised exchange.
        </P>
        <P>
          Transactions can materially affect the market price, particularly where liquidity is
          limited.
        </P>
        <P>
          Displayed prices may change between the time you view a transaction and the time it is
          executed.
        </P>
      </Section>

      <Section id="slippage" title="7. Slippage and Transaction Execution">
        <P>
          The price you ultimately receive may differ from the price displayed when you initiate a
          transaction.
        </P>
        <P>This can occur because of:</P>
        <Ul>
          <li>market movements;</li>
          <li>other transactions being processed before yours;</li>
          <li>liquidity conditions;</li>
          <li>transaction ordering;</li>
          <li>network congestion;</li>
          <li>slippage settings; or</li>
          <li>smart-contract behaviour.</li>
        </Ul>
        <P>Transactions may fail while still incurring blockchain network costs.</P>
        <P>SCOOP does not guarantee execution at a particular price.</P>
      </Section>

      <Section id="stock-token-pairing" title="8. Stock-Token and Quote-Asset Pairing">
        <P>
          SCOOP may allow a launched token to be paired with an eligible blockchain-based quote
          asset.
        </P>
        <P>
          Some quote assets may be associated with, reference, track or provide economic exposure to
          publicly traded stocks, exchange-traded funds or other financial instruments.
        </P>
        <aside className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3 text-[14px] leading-relaxed text-[var(--fg)]">
          <p>
            <strong className="font-medium">
              A SCOOP-launched token being paired with a stock token does not mean that the launched
              token represents that stock.
            </strong>
          </p>
        </aside>
        <P>Unless expressly stated otherwise, a SCOOP-launched token:</P>
        <Ul>
          <li>does not represent shares in the associated company;</li>
          <li>does not provide ownership of that company;</li>
          <li>does not provide shareholder or voting rights;</li>
          <li>does not provide rights to dividends;</li>
          <li>is not issued by the associated company;</li>
          <li>is not sponsored or endorsed by the associated company; and</li>
          <li>
            is not designed merely by virtue of the pairing to track the company&apos;s share price.
          </li>
        </Ul>
        <P>The two assets in a trading pair are separate assets.</P>
        <P>
          For example, the fact that a token trades against an asset associated with a particular
          stock does not transform the launched token into that stock or into a security representing
          that stock.
        </P>
      </Section>

      <Section id="quote-asset-risks" title="9. Risks of Stock Tokens and Other Quote Assets">
        <P>A stock token or other quote asset may itself introduce additional risks.</P>
        <P>Depending on the asset, these may include:</P>
        <Ul>
          <li>issuer risk;</li>
          <li>counterparty risk;</li>
          <li>custody risk;</li>
          <li>collateral risk;</li>
          <li>redemption restrictions;</li>
          <li>tracking differences;</li>
          <li>market-hours differences;</li>
          <li>price-feed dependencies;</li>
          <li>regulatory restrictions;</li>
          <li>geographic restrictions; and</li>
          <li>
            the possibility that the asset becomes unavailable or loses its intended relationship
            with an underlying instrument.
          </li>
        </Ul>
        <P>
          SCOOP does not control the terms, backing, redemption mechanism or legal structure of
          independently issued quote assets.
        </P>
        <P>
          You should review the issuer&apos;s documentation and understand the relevant asset before
          using it.
        </P>
      </Section>

      <Section id="price-relationship" title="10. Price Relationship Risk">
        <P>
          Trading two assets as a pair does not guarantee that either asset will maintain a
          particular relationship with the other.
        </P>
        <P>
          A launched token may rise or fall independently of its paired quote asset.
        </P>
        <P>
          Similarly, a token paired with a stock-related asset may perform entirely differently from
          the associated stock.
        </P>
        <P>
          Pairing should therefore <strong className="font-medium text-[var(--fg)]">not</strong> be
          interpreted as a prediction, hedge, correlation guarantee or representation that the assets
          will move together.
        </P>
      </Section>

      <Section id="trading-fees" title="11. Trading Fees and Configurable Economics">
        <P>
          Markets created through the SCOOP Protocol may contain fees and economic parameters
          established at launch.
        </P>
        <P>
          Depending on the functionality available, these may include protocol fees, creator
          allocations, deployer fees, holder rewards or other permitted fee structures.
        </P>
        <P>
          These mechanisms can materially affect the economics of buying, selling or holding an
          asset.
        </P>
        <P>
          A higher trading fee may mean that the price of an asset must move further in your favour
          before a transaction becomes profitable.
        </P>
        <P>You should review the applicable fee structure before trading.</P>
        <P>
          The existence of creator, deployer or holder rewards does not guarantee that those rewards
          will exceed trading losses, transaction costs, taxes or other expenses.
        </P>
      </Section>

      <Section id="creator-incentives" title="12. Creator and Deployer Incentives">
        <P>
          People involved in creating or promoting a token may have economic interests that differ
          from yours.
        </P>
        <P>
          Creators, deployers, reward recipients or other participants may receive fees or other
          economic benefits from activity involving a market.
        </P>
        <P>This can create incentives to encourage trading or attention.</P>
        <P>
          The fact that someone receives creator or deployer rewards does not mean they owe you a
          fiduciary duty or are acting in your interests.
        </P>
        <P>Consider these incentives when evaluating a market.</P>
      </Section>

      <Section id="holder-rewards" title="13. Holder Rewards">
        <P>
          Certain markets may include mechanisms that distribute rewards to eligible token holders.
        </P>
        <P>Rewards are not guaranteed.</P>
        <P>Their availability or value may depend on factors including:</P>
        <Ul>
          <li>trading volume;</li>
          <li>applicable fees;</li>
          <li>smart-contract functionality;</li>
          <li>eligibility rules;</li>
          <li>wallet holdings;</li>
          <li>timing;</li>
          <li>available assets; and</li>
          <li>technical operation of the relevant system.</li>
        </Ul>
        <P>
          Potential rewards should not be treated as guaranteed yield, interest or investment return.
        </P>
        <P>Rewards may be worth less than expected or nothing at all.</P>
      </Section>

      <Section id="smart-contract" title="14. Smart-Contract Risk">
        <P>SCOOP and third-party protocols may rely on smart contracts.</P>
        <P>
          Smart contracts can contain bugs, vulnerabilities, unexpected behaviour or design
          limitations.
        </P>
        <P>
          Even audited or extensively tested software cannot be guaranteed to be free from defects.
        </P>
        <P>A smart-contract failure could result in:</P>
        <Ul>
          <li>loss of assets;</li>
          <li>inaccessible assets;</li>
          <li>incorrect fee distributions;</li>
          <li>failed transactions;</li>
          <li>unexpected market behaviour; or</li>
          <li>permanent loss.</li>
        </Ul>
        <P>
          Some smart contracts may be immutable or difficult to modify after deployment.
        </P>
      </Section>

      <Section id="third-party-protocol" title="15. Third-Party Protocol Risk">
        <P>
          SCOOP may interact with independent decentralised protocols and blockchain infrastructure,
          including liquidity, routing and wallet systems.
        </P>
        <P>
          A failure or vulnerability in one of these systems could affect transactions initiated
          through SCOOP even if the SCOOP interface itself is operating normally.
        </P>
        <P>
          Scoop Tech Ltd does not control independent third-party protocols merely because SCOOP
          integrates with them.
        </P>
      </Section>

      <Section id="blockchain-network" title="16. Blockchain Network Risk">
        <P>Blockchain networks may experience:</P>
        <Ul>
          <li>congestion;</li>
          <li>outages;</li>
          <li>reorganisations;</li>
          <li>forks;</li>
          <li>validator or sequencer failures;</li>
          <li>delayed transactions;</li>
          <li>unexpected fee increases;</li>
          <li>protocol upgrades; or</li>
          <li>other technical problems.</li>
        </Ul>
        <P>
          Changes to an underlying network may affect SCOOP, a digital asset or a market.
        </P>
        <P>
          We cannot guarantee the continued availability or operation of any blockchain network.
        </P>
      </Section>

      <Section id="oracle" title="17. Oracle and Price-Feed Risk">
        <P>
          Certain SCOOP functionality may depend on external price feeds or oracle systems.
        </P>
        <P>Price information may be delayed, unavailable, inaccurate or manipulated.</P>
        <P>
          An oracle may stop updating or behave unexpectedly during unusual market conditions.
        </P>
        <P>
          If a smart contract depends on an incorrect or stale price, transactions or market
          behaviour may produce unexpected outcomes.
        </P>
        <P>
          The presence of an oracle does not guarantee that a displayed or calculated price is
          accurate.
        </P>
      </Section>

      <Section id="wallet" title="18. Wallet and Private-Key Risk">
        <P>You are responsible for your blockchain wallet.</P>
        <P>
          If you lose access to your wallet or private keys, your assets may be permanently
          inaccessible.
        </P>
        <P>
          If another person obtains your private key, seed phrase or sufficient control over your
          wallet, they may be able to transfer your assets without your permission.
        </P>
        <P>
          Scoop Tech Ltd cannot recover a lost private key or reverse an unauthorised blockchain
          transaction.
        </P>
        <P>
          <strong className="font-medium text-[var(--fg)]">
            Never share your private key or seed phrase with SCOOP or anyone claiming to represent
            SCOOP.
          </strong>
        </P>
      </Section>

      <Section id="irreversible" title="19. Irreversible Transactions">
        <P>Blockchain transactions are generally irreversible.</P>
        <P>
          Sending assets to the wrong address, purchasing the wrong token, approving an unintended
          transaction or interacting with an incorrect contract may result in permanent loss.
        </P>
        <P>
          SCOOP may not be able to cancel, refund or reverse a transaction once it has been submitted
          to a blockchain.
        </P>
        <P>Always review transaction details before signing.</P>
      </Section>

      <Section id="scams" title="20. Malicious Tokens, Scams and Impersonation">
        <P>
          Open blockchain ecosystems may contain scams, impersonators and malicious assets.
        </P>
        <P>
          A token may intentionally use a name, ticker, image or narrative resembling another
          company, project or asset.
        </P>
        <P>A familiar name or ticker does not prove authenticity.</P>
        <P>
          Social-media accounts can also be compromised, impersonated or used to promote fraudulent
          assets.
        </P>
        <P>
          You should independently verify contract addresses and other important information.
        </P>
      </Section>

      <Section id="manipulation" title="21. Market Manipulation">
        <P>
          Digital-asset markets, particularly markets with limited liquidity, may be susceptible to
          manipulation.
        </P>
        <P>Examples may include:</P>
        <Ul>
          <li>coordinated buying or selling;</li>
          <li>wash trading;</li>
          <li>misleading promotion;</li>
          <li>artificial volume;</li>
          <li>concentrated wallet activity;</li>
          <li>front-running or transaction-ordering strategies;</li>
          <li>pump-and-dump activity; and</li>
          <li>manipulation of public sentiment.</li>
        </Ul>
        <P>
          SCOOP cannot guarantee that market activity represents genuine independent demand.
        </P>
      </Section>

      <Section id="concentration" title="22. Concentration Risk">
        <P>
          A significant proportion of a token&apos;s supply may be held by a small number of wallets.
        </P>
        <P>
          Large holders may be able to materially influence price or liquidity by buying, selling or
          transferring their holdings.
        </P>
        <P>
          Wallet addresses that appear independent may also be controlled by the same person or
          entity.
        </P>
        <P>Holder information should therefore be interpreted cautiously.</P>
      </Section>

      <Section id="news-risk" title="23. News and Information Risk">
        <P>
          SCOOP may surface financial, company, stock and market-related news from third-party
          sources.
        </P>
        <P>News may be:</P>
        <Ul>
          <li>inaccurate;</li>
          <li>incomplete;</li>
          <li>delayed;</li>
          <li>subsequently corrected;</li>
          <li>based on unverified information; or</li>
          <li>interpreted differently by market participants.</li>
        </Ul>
        <P>
          A news story being displayed prominently by SCOOP does not mean the information is
          guaranteed to be accurate or that an associated asset will move in a particular direction.
        </P>
      </Section>

      <Section id="ai-risk" title="24. AI and Automated-System Risk">
        <P>
          SCOOP may use artificial intelligence or other automated systems to identify, rank,
          classify, summarise or associate news and market information.
        </P>
        <P>Automated systems can make mistakes.</P>
        <P>They may:</P>
        <Ul>
          <li>misunderstand a story;</li>
          <li>associate content with the wrong company or asset;</li>
          <li>omit important context;</li>
          <li>generate inaccurate summaries;</li>
          <li>overstate or understate relevance; or</li>
          <li>fail to identify important information.</li>
        </Ul>
        <P>
          You should independently verify information before making a financial decision.
        </P>
      </Section>

      <Section id="news-into-markets" title="25. Turning News Into Markets">
        <P>
          SCOOP may enable relevant stories or market events to inspire or become associated with
          user-created tokens or markets.
        </P>
        <aside className="rounded-[var(--radius-md)] border border-[var(--divider)] bg-[var(--bg-elevated)] px-4 py-3 text-[14px] leading-relaxed text-[var(--fg)]">
          <p>
            <strong className="font-medium">
              The existence of a news story does not establish the value of a token created around
              that story.
            </strong>
          </p>
        </aside>
        <P>
          Similarly, SCOOP surfacing a story as relevant or making market-creation functionality
          available alongside it does not constitute:
        </P>
        <Ul>
          <li>an investment recommendation;</li>
          <li>a prediction that the story will affect a particular price;</li>
          <li>an endorsement of a token created from the story; or</li>
          <li>a representation that a market is suitable for you.</li>
        </Ul>
        <P>Narrative-driven markets can be particularly speculative and volatile.</P>
      </Section>

      <Section id="analytics" title="26. Information and Analytics Risk">
        <P>
          SCOOP may display information such as prices, charts, trades, holders, market
          capitalisation, volume, creator earnings or other analytics.
        </P>
        <P>
          Such information may be calculated from blockchain or third-party data and may be delayed,
          incomplete or inaccurate.
        </P>
        <P>Different services may calculate the same metric differently.</P>
        <P>
          You should not rely exclusively on SCOOP analytics when making a transaction.
        </P>
      </Section>

      <Section id="regulatory" title="27. Regulatory Risk">
        <P>
          The legal and regulatory treatment of digital assets, decentralised protocols, tokenised
          assets and related technologies continues to develop.
        </P>
        <P>
          Laws, regulations, regulatory interpretations or enforcement approaches may change.
        </P>
        <P>Such changes could affect:</P>
        <Ul>
          <li>your ability to use SCOOP;</li>
          <li>the availability of particular assets;</li>
          <li>token launches;</li>
          <li>trading;</li>
          <li>creator rewards;</li>
          <li>quote assets;</li>
          <li>blockchain networks; or</li>
          <li>the operation of SCOOP itself.</li>
        </Ul>
        <P>
          A feature being technically available does not necessarily mean that using it is lawful for
          every person in every jurisdiction.
        </P>
        <P>You are responsible for understanding the laws applicable to you.</P>
      </Section>

      <Section id="tax" title="28. Tax Risk">
        <P>
          Buying, selling, receiving, creating or otherwise interacting with digital assets may have
          tax consequences.
        </P>
        <P>
          Creator rewards, deployer fees, holder rewards and other distributions may also create tax
          liabilities.
        </P>
        <P>Tax treatment varies by jurisdiction and individual circumstances.</P>
        <P>SCOOP does not provide tax advice.</P>
        <P>You should obtain independent professional advice where necessary.</P>
      </Section>

      <Section id="third-party-service" title="29. Third-Party Service Risk">
        <P>SCOOP may depend on third-party services such as:</P>
        <Ul>
          <li>wallet providers;</li>
          <li>blockchain infrastructure;</li>
          <li>RPC providers;</li>
          <li>decentralised exchanges;</li>
          <li>data providers;</li>
          <li>oracle providers;</li>
          <li>social-media platforms;</li>
          <li>authentication providers;</li>
          <li>hosting infrastructure; and</li>
          <li>other technology providers.</li>
        </Ul>
        <P>
          These services may become unavailable, change their terms, experience security incidents or
          cease operating.
        </P>
        <P>This could temporarily or permanently affect parts of SCOOP.</P>
      </Section>

      <Section id="interface-availability" title="30. Interface Availability">
        <P>
          The scoop.fun website or interface may become unavailable because of maintenance, technical
          failure, cyberattack, third-party outages or other circumstances.
        </P>
        <P>Scoop Tech Ltd does not guarantee continuous access to the interface.</P>
        <P>
          Where smart contracts are deployed on a public blockchain, they may continue operating
          independently of the SCOOP website.
        </P>
        <P>
          Conversely, the existence of a smart contract does not guarantee that an accessible user
          interface will always be available.
        </P>
      </Section>

      <Section id="cybersecurity" title="31. Cybersecurity Risk">
        <P>
          Digital-asset users are frequent targets of phishing, malware, fake websites, malicious
          wallet approvals and social engineering.
        </P>
        <P>Attackers may impersonate SCOOP, its team or other users.</P>
        <P>
          Always verify that you are using the correct website and carefully inspect wallet requests
          before signing.
        </P>
        <P>
          SCOOP cannot protect you from every form of malicious activity occurring outside systems we
          control.
        </P>
      </Section>

      <Section id="legal-rights" title="32. Legal Rights in Digital Assets">
        <P>
          Owning a digital token does not necessarily provide contractual, ownership, governance or
          other legal rights.
        </P>
        <P>
          The rights associated with an asset depend on its design, issuer and applicable law.
        </P>
        <P>
          Do not assume that purchasing a token gives you rights against Scoop Tech Ltd, a token
          creator, a company referenced by the token or the issuer of a paired asset unless those
          rights are expressly established.
        </P>
      </Section>

      <Section id="no-deposit-protection" title="33. No Deposit Protection">
        <P>
          Digital assets used through SCOOP should not be assumed to have the protections associated
          with money held in a bank account.
        </P>
        <P>
          Unless expressly stated and legally applicable, assets are not protected by
          deposit-guarantee arrangements merely because you interact with them through SCOOP.
        </P>
        <P>
          You should not assume that compensation will be available if an asset loses value or a
          decentralised protocol fails.
        </P>
      </Section>

      <Section id="your-responsibility" title="34. Your Responsibility">
        <P>
          You are responsible for deciding whether to interact with SCOOP, a token, a market or a
          blockchain transaction.
        </P>
        <P>Before transacting, you should consider:</P>
        <Ul>
          <li>what asset you are acquiring;</li>
          <li>who created or issued it;</li>
          <li>what rights, if any, it provides;</li>
          <li>the applicable fee structure;</li>
          <li>available liquidity;</li>
          <li>ownership concentration;</li>
          <li>the nature of its paired asset;</li>
          <li>smart-contract and blockchain risks;</li>
          <li>whether you can afford a complete loss; and</li>
          <li>whether the activity is lawful for you.</li>
        </Ul>
        <P>Do not sign a transaction that you do not understand.</P>
      </Section>

      <Section id="no-guarantee" title="35. No Guarantee">
        <P>Scoop Tech Ltd does not guarantee:</P>
        <Ul>
          <li>the value of any digital asset;</li>
          <li>the success of any launch;</li>
          <li>future liquidity;</li>
          <li>the availability of buyers or sellers;</li>
          <li>the accuracy of third-party information;</li>
          <li>any particular investment return;</li>
          <li>creator or holder reward amounts;</li>
          <li>the performance of a paired stock or quote asset;</li>
          <li>the security of third-party protocols; or</li>
          <li>that you will recover assets lost through blockchain activity.</li>
        </Ul>
      </Section>

      <Section id="acceptance" title="36. Acceptance of Risk">
        <P>
          By using SCOOP and authorising blockchain transactions, you acknowledge that you understand
          that digital assets and decentralised markets involve significant risks.
        </P>
        <P>You accept responsibility for evaluating those risks before proceeding.</P>
        <P>
          If you do not understand the risks associated with a transaction,{' '}
          <strong className="font-medium text-[var(--fg)]">do not sign it</strong>.
        </P>
      </Section>

      <Section id="contact" title="37. Contact">
        <P>Questions about this Risk Disclosure can be sent to:</P>
        <P>
          <strong className="font-medium text-[var(--fg)]">Scoop Tech Ltd</strong>
          <br />
          Trading as <strong className="font-medium text-[var(--fg)]">SCOOP</strong>
          <br />
          Email: <MailLink />
        </P>
        <P>
          This Risk Disclosure should be read together with SCOOP&apos;s{' '}
          <strong className="font-medium text-[var(--fg)]">Terms of Use</strong>,{' '}
          <strong className="font-medium text-[var(--fg)]">Privacy Policy</strong> and{' '}
          <strong className="font-medium text-[var(--fg)]">Disclaimer</strong>.
        </P>
      </Section>
    </article>
  );
}
