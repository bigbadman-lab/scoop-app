export type SupportFaq = {
  id: string;
  question: string;
  /** Structured answer blocks rendered by the support UI. */
  answer: SupportAnswerBlock[];
};

export type SupportAnswerBlock =
  | { type: 'p'; text: string }
  | { type: 'p'; emphasis: 'strong'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] };

export type SupportTopic = {
  id: string;
  label: string;
  faqs: SupportFaq[];
};

export const SUPPORT_TOPICS: SupportTopic[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    faqs: [
      {
        id: 'what-is-scoop',
        question: 'What is SCOOP?',
        answer: [
          {
            type: 'p',
            text: 'SCOOP is an onchain market platform built around news, narratives and markets.',
          },
          {
            type: 'p',
            text: 'You can discover market-relevant stories, explore tokens and markets, connect a wallet, launch tokens and trade through supported blockchain infrastructure.',
          },
          {
            type: 'p',
            text: "SCOOP's launch protocol also supports different pairing and fee structures, allowing markets to be configured differently depending on the launch.",
          },
        ],
      },
      {
        id: 'what-network',
        question: 'What network does SCOOP use?',
        answer: [
          {
            type: 'p',
            text: 'SCOOP operates on Robinhood Chain.',
          },
          {
            type: 'p',
            text: 'Your wallet must be connected to the correct network before you can perform blockchain transactions.',
          },
          {
            type: 'p',
            text: 'Where possible, SCOOP will prompt your wallet to switch to the required network.',
          },
        ],
      },
      {
        id: 'need-account',
        question: 'Do I need an account?',
        answer: [
          {
            type: 'p',
            text: 'You can browse parts of SCOOP without connecting a wallet.',
          },
          {
            type: 'p',
            text: 'Certain account functionality may also be available through supported sign-in methods.',
          },
          {
            type: 'p',
            text: 'However, blockchain actions such as launching or trading require a compatible wallet because transactions must be authorised by you.',
          },
        ],
      },
      {
        id: 'need-wallet',
        question: 'Do I need a wallet?',
        answer: [
          {
            type: 'p',
            text: 'You need a compatible blockchain wallet to perform onchain actions.',
          },
          {
            type: 'p',
            text: 'Your wallet is used to authorise transactions. SCOOP does not hold your private keys and cannot sign transactions on your behalf.',
          },
        ],
      },
    ],
  },
  {
    id: 'wallets',
    label: 'Wallets',
    faqs: [
      {
        id: 'connect-wallet',
        question: 'How do I connect my wallet?',
        answer: [
          {
            type: 'p',
            text: 'Select Connect Wallet and choose one of the available wallet options.',
          },
          {
            type: 'p',
            text: 'Your wallet may ask you to approve the connection and switch to Robinhood Chain.',
          },
          {
            type: 'p',
            text: 'Connecting a wallet does not by itself give SCOOP permission to move your assets.',
          },
          {
            type: 'p',
            text: 'Blockchain transactions require separate approval through your wallet.',
          },
        ],
      },
      {
        id: 'custodial',
        question: 'Is SCOOP custodial?',
        answer: [
          { type: 'p', text: 'No.' },
          {
            type: 'p',
            text: 'SCOOP is designed to be non-custodial. You retain control of your wallet and private keys.',
          },
          {
            type: 'p',
            text: 'SCOOP cannot access your wallet simply because it is connected to the website.',
          },
        ],
      },
      {
        id: 'seed-phrase',
        question: 'Will SCOOP ever ask for my seed phrase?',
        answer: [
          {
            type: 'p',
            emphasis: 'strong',
            text: 'No. Never.',
          },
          { type: 'p', text: 'SCOOP will never ask for:' },
          {
            type: 'ul',
            items: [
              'your seed phrase;',
              'your private key; or',
              'any other secret that provides unrestricted access to your wallet.',
            ],
          },
          {
            type: 'p',
            text: 'Anyone asking for this information while claiming to represent SCOOP is attempting to compromise your wallet.',
          },
        ],
      },
      {
        id: 'wallet-wont-connect',
        question: "My wallet won't connect. What should I do?",
        answer: [
          { type: 'p', text: 'Try:' },
          {
            type: 'ol',
            items: [
              'Confirming that your wallet is unlocked.',
              'Refreshing SCOOP.',
              'Disconnecting and reconnecting your wallet.',
              'Checking that your wallet supports the required network.',
              'Switching to Robinhood Chain.',
              'Checking whether your wallet extension or mobile wallet is up to date.',
              'Trying again after disabling browser extensions that may interfere with wallet connections.',
            ],
          },
          {
            type: 'p',
            text: "If the problem continues, contact us and tell us which wallet and browser you're using.",
          },
          {
            type: 'p',
            emphasis: 'strong',
            text: 'Do not send your seed phrase or private key.',
          },
        ],
      },
      {
        id: 'recover-wallet',
        question: 'Can SCOOP recover my wallet?',
        answer: [
          { type: 'p', text: 'No.' },
          {
            type: 'p',
            text: 'SCOOP does not control your wallet or private keys.',
          },
          {
            type: 'p',
            text: 'If you lose access to your wallet, recovery depends on the recovery options provided by your wallet provider.',
          },
        ],
      },
    ],
  },
  {
    id: 'launching',
    label: 'Launching a Token',
    faqs: [
      {
        id: 'how-to-launch',
        question: 'How do I launch a token?',
        answer: [
          {
            type: 'p',
            text: 'Open the Launch flow and follow the steps shown.',
          },
          {
            type: 'p',
            text: "You'll be asked to configure information associated with your launch, which may include:",
          },
          {
            type: 'ul',
            items: [
              'token name;',
              'ticker;',
              'image;',
              'description;',
              'pairing option;',
              'creator reward recipient;',
              'permitted fee settings; and',
              'other available market parameters.',
            ],
          },
          {
            type: 'p',
            text: "You'll be shown the relevant configuration before the launch transaction is submitted.",
          },
          {
            type: 'p',
            text: 'Your wallet must approve the transaction before anything is deployed onchain.',
          },
        ],
      },
      {
        id: 'who-deploys',
        question: 'Who deploys the token?',
        answer: [
          {
            type: 'p',
            text: 'The launch is initiated by your connected wallet through the SCOOP Protocol.',
          },
          {
            type: 'p',
            text: 'The relevant SCOOP smart contracts handle the deployment and market setup according to the configuration you select.',
          },
          {
            type: 'p',
            text: 'The resulting token and market exist onchain.',
          },
        ],
      },
      {
        id: 'edit-after-launch',
        question: 'Can I edit a token after launching it?',
        answer: [
          {
            type: 'p',
            text: 'Some information may be editable at the interface level, but information or configuration permanently established by smart contracts may not be changeable after launch.',
          },
          {
            type: 'p',
            text: 'Always review your launch carefully before confirming the transaction.',
          },
        ],
      },
      {
        id: 'cancel-launch',
        question: 'Can SCOOP cancel a launch?',
        answer: [
          {
            type: 'p',
            text: 'Once a successful blockchain transaction has created a token or market, SCOOP generally cannot reverse that transaction or remove the token from the blockchain.',
          },
          {
            type: 'p',
            text: 'SCOOP may be able to restrict how content appears through the SCOOP-operated interface where appropriate, but this does not delete blockchain contracts or transactions.',
          },
        ],
      },
      {
        id: 'launch-failed',
        question: 'My launch transaction failed.',
        answer: [
          {
            type: 'p',
            text: 'A blockchain transaction can fail for several reasons, including:',
          },
          {
            type: 'ul',
            items: [
              'insufficient funds for network fees;',
              'wallet rejection;',
              'incorrect network;',
              'network congestion;',
              'changed blockchain state;',
              'smart-contract conditions; or',
              'temporary infrastructure problems.',
            ],
          },
          {
            type: 'p',
            text: 'A failed transaction does not necessarily mean there is a problem with your wallet.',
          },
          {
            type: 'p',
            text: 'Check the transaction status and try again if appropriate.',
          },
          {
            type: 'p',
            text: 'If you need help, send us the transaction hash.',
          },
        ],
      },
    ],
  },
  {
    id: 'pairing',
    label: 'Pairing Options',
    faqs: [
      {
        id: 'paired-with',
        question: 'What does "paired with" mean?',
        answer: [
          {
            type: 'p',
            text: 'Every market requires assets to trade against one another.',
          },
          {
            type: 'p',
            text: 'SCOOP may allow a launched token to be paired with different supported quote assets.',
          },
          {
            type: 'p',
            text: 'The selected pairing determines what asset traders use on the other side of that market.',
          },
        ],
      },
      {
        id: 'stock-token-pairs',
        question: 'What are stock-token pairs?',
        answer: [
          {
            type: 'p',
            text: 'Some supported quote assets may be blockchain-based assets associated with or providing exposure to publicly traded stocks or ETFs.',
          },
          {
            type: 'p',
            text: 'This allows a SCOOP-launched token to trade against a stock-related onchain asset rather than only a conventional crypto asset.',
          },
        ],
      },
      {
        id: 'pairing-not-stock',
        question:
          'Does pairing a token with a stock mean the token represents that stock?',
        answer: [
          {
            type: 'p',
            emphasis: 'strong',
            text: 'No.',
          },
          {
            type: 'p',
            text: 'A SCOOP-launched token and its paired stock token are separate assets.',
          },
          {
            type: 'p',
            text: 'Pairing a token with a stock-related asset does not mean the launched token:',
          },
          {
            type: 'ul',
            items: [
              'represents shares in the company;',
              'gives you ownership of the company;',
              'provides voting rights;',
              'provides dividend rights;',
              'tracks the stock price; or',
              'is sponsored or endorsed by the company.',
            ],
          },
          {
            type: 'p',
            text: 'The pairing simply determines the assets within that particular onchain market.',
          },
        ],
      },
      {
        id: 'who-issues-stock-tokens',
        question: 'Who issues the stock tokens?',
        answer: [
          {
            type: 'p',
            text: 'Stock-related quote assets may be issued or operated by independent third parties.',
          },
          {
            type: 'p',
            text: 'SCOOP does not create rights in an underlying company merely by supporting an asset as a pairing option.',
          },
          {
            type: 'p',
            text: 'Always review information from the relevant asset provider if you want to understand how a particular stock token works.',
          },
        ],
      },
    ],
  },
  {
    id: 'trading',
    label: 'Trading',
    faqs: [
      {
        id: 'how-to-buy',
        question: 'How do I buy a token?',
        answer: [
          {
            type: 'p',
            text: 'Open the relevant market page, connect your wallet and use the trading interface.',
          },
          {
            type: 'p',
            text: 'Choose the amount you want to trade and review the transaction details.',
          },
          {
            type: 'p',
            text: 'Your wallet will then ask you to approve the transaction.',
          },
          {
            type: 'p',
            text: 'Nothing is final until you authorise it.',
          },
        ],
      },
      {
        id: 'how-to-sell',
        question: 'How do I sell a token?',
        answer: [
          {
            type: 'p',
            text: 'Open the market, select Sell, choose the amount and review the transaction.',
          },
          {
            type: 'p',
            text: 'Your wallet may first require approval for the relevant token before the trade itself can be executed.',
          },
        ],
      },
      {
        id: 'price-different',
        question: 'Why is the price different from what I expected?',
        answer: [
          {
            type: 'p',
            text: 'Onchain market prices can move between viewing and executing a transaction.',
          },
          {
            type: 'p',
            text: 'The final result can be affected by:',
          },
          {
            type: 'ul',
            items: [
              'available liquidity;',
              'trade size;',
              'slippage;',
              'other trades;',
              'transaction ordering;',
              'market movement; and',
              'applicable fees.',
            ],
          },
          {
            type: 'p',
            text: 'Always review the transaction before confirming it.',
          },
        ],
      },
      {
        id: 'what-is-slippage',
        question: 'What is slippage?',
        answer: [
          {
            type: 'p',
            text: 'Slippage is the difference between the expected price of a trade and the price at which it actually executes.',
          },
          {
            type: 'p',
            text: 'Slippage can be greater in markets with lower liquidity or during periods of rapid trading.',
          },
        ],
      },
      {
        id: 'trade-failed',
        question: 'Why did my trade fail?',
        answer: [
          { type: 'p', text: 'Common causes include:' },
          {
            type: 'ul',
            items: [
              'insufficient balance;',
              'insufficient funds for network fees;',
              'incorrect network;',
              'slippage limits;',
              'price movement;',
              'missing token approval;',
              'wallet rejection;',
              'network issues; or',
              'temporary infrastructure problems.',
            ],
          },
          {
            type: 'p',
            text: 'If you contact support, include the transaction hash where available.',
          },
        ],
      },
      {
        id: 'reverse-trade',
        question: 'Can SCOOP reverse a trade?',
        answer: [
          { type: 'p', text: 'No.' },
          {
            type: 'p',
            text: 'Confirmed blockchain transactions are generally irreversible.',
          },
          {
            type: 'p',
            text: 'SCOOP cannot simply undo a completed trade because you changed your mind, entered the wrong amount or the market moved afterwards.',
          },
          {
            type: 'p',
            text: 'Always check transaction details before signing.',
          },
        ],
      },
    ],
  },
  {
    id: 'fees',
    label: 'Fees',
    faqs: [
      {
        id: 'what-fees',
        question: 'What fees does SCOOP charge?',
        answer: [
          {
            type: 'p',
            text: 'Markets on SCOOP can involve several types of fees.',
          },
          {
            type: 'p',
            text: 'Depending on the market and transaction, these may include:',
          },
          {
            type: 'ul',
            items: [
              'protocol trading fees;',
              'creator allocations;',
              'additional deployer-configured trading fees;',
              'blockchain network fees; and',
              'other fees displayed as part of the transaction.',
            ],
          },
          {
            type: 'p',
            text: 'The applicable structure should be shown through SCOOP before you trade.',
          },
        ],
      },
      {
        id: 'different-fees',
        question: 'Can different SCOOP markets have different fees?',
        answer: [
          { type: 'p', text: 'Yes.' },
          {
            type: 'p',
            text: 'SCOOP is designed to support configurable market economics.',
          },
          {
            type: 'p',
            text: 'A Deployer may be able to select certain permitted fee options when creating a market.',
          },
          {
            type: 'p',
            text: "This means you should check the fee information for the specific market you're trading rather than assuming every SCOOP market has identical economics.",
          },
        ],
      },
      {
        id: 'base-trading-fee',
        question: 'What is the SCOOP base trading fee?',
        answer: [
          {
            type: 'p',
            text: 'The SCOOP Protocol has a 1% base trading fee.',
          },
          {
            type: 'p',
            text: 'The applicable creator allocation and other protocol distributions are handled according to the relevant market and protocol configuration.',
          },
        ],
      },
      {
        id: 'deployer-fee',
        question: 'What is an additional deployer fee?',
        answer: [
          {
            type: 'p',
            text: 'A launch may include an optional additional trading fee selected by the Deployer.',
          },
          {
            type: 'p',
            text: 'Where enabled, this is separate from the standard SCOOP base trading fee.',
          },
          {
            type: 'p',
            text: 'The permitted additional fee can be configured in 0.1% increments, from 0% up to a maximum of 2%.',
          },
          {
            type: 'p',
            text: 'The selected fee should be visible before you trade.',
          },
        ],
      },
      {
        id: 'network-fees',
        question: 'What are network fees?',
        answer: [
          {
            type: 'p',
            text: 'Blockchain networks charge fees for processing transactions.',
          },
          {
            type: 'p',
            text: "These are separate from SCOOP's protocol or market fees.",
          },
          {
            type: 'p',
            text: 'Network fees can change depending on network conditions and are not paid to SCOOP merely because you used the SCOOP interface.',
          },
        ],
      },
    ],
  },
  {
    id: 'creator-rewards',
    label: 'Creator Rewards',
    faqs: [
      {
        id: 'what-creator-rewards',
        question: 'What are creator rewards?',
        answer: [
          {
            type: 'p',
            text: 'SCOOP markets can allocate part of their trading economics to a designated creator.',
          },
          {
            type: 'p',
            text: 'The standard SCOOP creator allocation is 70% of the SCOOP base trading fee, subject to the applicable protocol rules and market configuration.',
          },
        ],
      },
      {
        id: 'who-receives-creator',
        question: 'Who can receive creator rewards?',
        answer: [
          {
            type: 'p',
            text: 'When supported by the launch configuration, rewards may be directed to a connected wallet or an eligible creator identity.',
          },
          {
            type: 'p',
            text: 'The available options will be displayed during the launch flow.',
          },
        ],
      },
      {
        id: 'x-account-rewards',
        question: 'Can rewards be assigned to an X account?',
        answer: [
          {
            type: 'p',
            text: 'Where this feature is available, a Deployer can select an eligible X identity as the creator reward recipient.',
          },
          {
            type: 'p',
            text: 'SCOOP uses the identity associated with that account rather than relying solely on its visible @handle.',
          },
          {
            type: 'p',
            text: 'This matters because an X username can change while the underlying account remains the same.',
          },
        ],
      },
      {
        id: 'x-not-connected',
        question: "What if the X creator hasn't connected a wallet yet?",
        answer: [
          {
            type: 'p',
            text: 'Creator rewards can be associated with an eligible X identity before that person has connected a claiming wallet.',
          },
          {
            type: 'p',
            text: 'Rewards can then accumulate for that identity according to the applicable protocol and reward system.',
          },
          {
            type: 'p',
            text: 'The creator will need to complete the required verification process before claiming them.',
          },
        ],
      },
      {
        id: 'x-claim',
        question: 'How does an X creator claim rewards?',
        answer: [
          {
            type: 'p',
            text: 'The creator will need to authenticate the relevant X identity and connect the wallet they want to use for the claim.',
          },
          {
            type: 'p',
            text: 'SCOOP verifies the identity against the recipient originally selected for the launch.',
          },
          {
            type: 'p',
            text: 'This is designed to prevent another person from claiming rewards simply because they later obtained the same visible X username.',
          },
        ],
      },
      {
        id: 'change-creator',
        question: 'Can I change the creator after launch?',
        answer: [
          {
            type: 'p',
            text: 'Where creator entitlement has been established as part of the launch configuration, it may not be possible to change it afterwards.',
          },
          {
            type: 'p',
            text: 'Review the selected creator carefully before confirming a launch.',
          },
        ],
      },
    ],
  },
  {
    id: 'holder-rewards',
    label: 'Holder Rewards',
    faqs: [
      {
        id: 'what-holder-rewards',
        question: 'What are holder rewards?',
        answer: [
          {
            type: 'p',
            text: "Certain launches may use a fee structure that distributes part of the market's trading economics to eligible token holders.",
          },
          {
            type: 'p',
            text: 'Where enabled, the market page should identify the relevant reward mechanism.',
          },
        ],
      },
      {
        id: 'holder-guaranteed',
        question: 'Are holder rewards guaranteed?',
        answer: [
          { type: 'p', text: 'No.' },
          {
            type: 'p',
            text: 'Rewards depend on factors such as trading activity, the applicable fee structure, eligibility and the operation of the relevant smart contracts.',
          },
          {
            type: 'p',
            text: 'A holder-reward market does not guarantee income or profit.',
          },
        ],
      },
      {
        id: 'holder-frequency',
        question: 'How often are holder rewards distributed?',
        answer: [
          {
            type: 'p',
            text: "Where a launch uses SCOOP's supported holder-reward structure, rewards may be distributed or accounted for according to the schedule shown for that market.",
          },
          {
            type: 'p',
            text: 'Always check the individual market because not every launch uses the same fee configuration.',
          },
        ],
      },
    ],
  },
  {
    id: 'deployer-rewards',
    label: 'Deployer Rewards',
    faqs: [
      {
        id: 'what-deployer-rewards',
        question: 'What are deployer rewards?',
        answer: [
          {
            type: 'p',
            text: 'SCOOP may allow a Deployer to configure an additional permitted trading fee when creating a market.',
          },
          {
            type: 'p',
            text: "Where selected, the applicable share generated by that mechanism is separate from SCOOP's standard creator allocation.",
          },
          {
            type: 'p',
            text: 'The exact fee should be visible on the market before users trade.',
          },
        ],
      },
      {
        id: 'every-launch-deployer-fee',
        question: 'Does every launch have a deployer fee?',
        answer: [
          { type: 'p', text: 'No.' },
          {
            type: 'p',
            text: 'Additional deployer fees are optional and depend on the configuration selected at launch.',
          },
        ],
      },
    ],
  },
  {
    id: 'claims',
    label: 'Claims',
    faqs: [
      {
        id: 'see-rewards',
        question: 'Where can I see my rewards?',
        answer: [
          {
            type: 'p',
            text: 'Where supported, your SCOOP account or claim interface will display rewards associated with your connected wallet or verified identity.',
          },
          {
            type: 'p',
            text: 'Blockchain information may take a short period to be reflected in the interface.',
          },
        ],
      },
      {
        id: 'cant-claim',
        question: "Why can't I claim?",
        answer: [
          { type: 'p', text: 'Possible reasons include:' },
          {
            type: 'ul',
            items: [
              'the wrong wallet is connected;',
              'the wrong X identity is authenticated;',
              'there are no currently claimable rewards;',
              'the reward is associated with another identity;',
              'a previous claim is still being processed;',
              'the network is unavailable; or',
              'the transaction has not yet been confirmed.',
            ],
          },
          {
            type: 'p',
            text: 'Check your connected identity and wallet before contacting support.',
          },
        ],
      },
      {
        id: 'redirect-rewards',
        question: 'Can SCOOP send rewards to a different person?',
        answer: [
          {
            type: 'p',
            text: "SCOOP cannot simply redirect another person's accrued entitlement because someone requests it through support.",
          },
          {
            type: 'p',
            text: 'Claims must satisfy the identity and blockchain rules governing the relevant rewards.',
          },
          {
            type: 'p',
            text: 'This protects creators and other reward recipients from unauthorised claims.',
          },
        ],
      },
    ],
  },
  {
    id: 'news',
    label: 'News',
    faqs: [
      {
        id: 'news-source',
        question: "Where does SCOOP's news come from?",
        answer: [
          {
            type: 'p',
            text: 'SCOOP processes market and stock-related information from external sources and uses its own systems to organise and surface stories that may be relevant to markets.',
          },
          {
            type: 'p',
            text: 'The news experience is designed to help users find signal without having to work through every headline themselves.',
          },
        ],
      },
      {
        id: 'every-story',
        question: 'Does SCOOP publish every financial story?',
        answer: [
          { type: 'p', text: 'No.' },
          {
            type: 'p',
            text: 'SCOOP is not intended to be an exhaustive feed of every headline.',
          },
          {
            type: 'p',
            text: 'Our systems are designed to surface stories considered relevant to the types of markets and companies SCOOP covers.',
          },
        ],
      },
      {
        id: 'different-feeds',
        question: 'Why are there different news feeds?',
        answer: [
          {
            type: 'p',
            text: 'Different feeds let you explore the market from different angles rather than receiving one endless stream of headlines.',
          },
          {
            type: 'p',
            text: 'Depending on the current product, feeds may focus on different types of market or stock-related information.',
          },
        ],
      },
      {
        id: 'story-not-trade',
        question: 'Does a story appearing on SCOOP mean I should trade it?',
        answer: [
          { type: 'p', text: 'No.' },
          {
            type: 'p',
            text: 'SCOOP surfacing a story means our systems considered it relevant enough to show.',
          },
          {
            type: 'p',
            emphasis: 'strong',
            text: 'It is not a recommendation to buy, sell or launch anything.',
          },
        ],
      },
      {
        id: 'news-become-market',
        question: 'Can news become a market?',
        answer: [
          {
            type: 'p',
            text: 'SCOOP is built around the idea that relevant stories and narratives can become the starting point for onchain markets.',
          },
          {
            type: 'p',
            text: 'Where available, users may be able to launch a token or market inspired by a surfaced story.',
          },
          {
            type: 'p',
            text: 'That does not mean SCOOP endorses the resulting token or predicts that the story will create financial value.',
          },
        ],
      },
    ],
  },
  {
    id: 'charts',
    label: 'Charts and Market Data',
    faqs: [
      {
        id: 'chart-source',
        question: 'Where does the chart data come from?',
        answer: [
          {
            type: 'p',
            text: 'SCOOP market information is derived from blockchain activity and supporting data infrastructure.',
          },
          {
            type: 'p',
            text: 'Charts are designed to represent trading activity for the relevant market.',
          },
        ],
      },
      {
        id: 'chart-mismatch',
        question: "Why doesn't a chart exactly match another website?",
        answer: [
          {
            type: 'p',
            text: 'Platforms can calculate candles, volume, price and other metrics differently.',
          },
          {
            type: 'p',
            text: 'Differences may also result from indexing delays, quote assets, time intervals or data-source methodology.',
          },
        ],
      },
      {
        id: 'trades-realtime',
        question: 'Are trades shown in real time?',
        answer: [
          {
            type: 'p',
            text: 'SCOOP aims to surface onchain trading activity quickly, but there may be a delay between a blockchain transaction and its appearance in the interface.',
          },
          {
            type: 'p',
            text: 'Always use the underlying blockchain transaction as the authoritative record of whether an onchain transaction completed.',
          },
        ],
      },
      {
        id: 'top-holders',
        question: 'What does "Top Holders" mean?',
        answer: [
          {
            type: 'p',
            text: 'Top Holders shows wallet addresses holding significant amounts of the relevant token based on available blockchain data.',
          },
          {
            type: 'p',
            text: 'One person may control multiple wallets, and a wallet may belong to a smart contract, liquidity position or other system rather than an individual trader.',
          },
          {
            type: 'p',
            text: 'Holder information should therefore be interpreted carefully.',
          },
        ],
      },
    ],
  },
  {
    id: 'transactions',
    label: 'Transactions',
    faqs: [
      {
        id: 'tx-hash',
        question: 'What is a transaction hash?',
        answer: [
          {
            type: 'p',
            text: 'A transaction hash is the unique identifier for a blockchain transaction.',
          },
          {
            type: 'p',
            text: 'It allows you and support to locate the transaction on a blockchain explorer and determine whether it succeeded, failed or remains pending.',
          },
        ],
      },
      {
        id: 'find-tx-hash',
        question: 'Where can I find my transaction hash?',
        answer: [
          {
            type: 'p',
            text: 'Your wallet normally displays recent transaction activity.',
          },
          {
            type: 'p',
            text: 'SCOOP may also link to the relevant blockchain explorer after a transaction is submitted.',
          },
        ],
      },
      {
        id: 'pending-tx',
        question: 'My transaction says "pending."',
        answer: [
          {
            type: 'p',
            text: 'A transaction may remain pending while the blockchain processes it.',
          },
          {
            type: 'p',
            text: 'Network congestion and other conditions can affect confirmation time.',
          },
          {
            type: 'p',
            text: 'Avoid repeatedly submitting the same transaction unless you understand what the additional transactions will do.',
          },
        ],
      },
      {
        id: 'tx-not-updated',
        question: "My transaction succeeded, but SCOOP hasn't updated.",
        answer: [
          {
            type: 'p',
            text: 'Blockchain data sometimes takes time to reach application interfaces and indexing systems.',
          },
          {
            type: 'p',
            text: 'Try refreshing the page after a short period.',
          },
          {
            type: 'p',
            text: 'If the blockchain shows the transaction as successful but SCOOP still does not reflect it, contact us with the transaction hash.',
          },
        ],
      },
      {
        id: 'failed-paid-fee',
        question: 'My transaction failed but I still paid a fee.',
        answer: [
          {
            type: 'p',
            text: 'Blockchain networks may charge gas for attempting to process a transaction even when the transaction ultimately fails.',
          },
          {
            type: 'p',
            text: 'Network fees are paid for computation performed by the blockchain and generally cannot be refunded by SCOOP.',
          },
        ],
      },
    ],
  },
  {
    id: 'token-safety',
    label: 'Token Safety',
    faqs: [
      {
        id: 'verify-every-token',
        question: 'Does SCOOP verify every token?',
        answer: [
          { type: 'p', text: 'No.' },
          {
            type: 'p',
            text: 'SCOOP is an open onchain system where independent users can create tokens and markets.',
          },
          {
            type: 'p',
            text: 'The presence of a token on SCOOP does not mean that Scoop Tech Ltd endorses or recommends it.',
          },
        ],
      },
      {
        id: 'correct-token',
        question: "How can I make sure I'm looking at the correct token?",
        answer: [
          {
            type: 'p',
            text: 'The contract address is the most reliable identifier for an onchain token.',
          },
          {
            type: 'p',
            text: 'Names and tickers can be duplicated.',
          },
          {
            type: 'p',
            text: 'When verifying an asset, compare its contract address rather than relying only on its name, ticker or image.',
          },
        ],
      },
      {
        id: 'same-ticker',
        question: 'Can two tokens have the same ticker?',
        answer: [
          { type: 'p', text: 'Yes.' },
          {
            type: 'p',
            text: 'Blockchain token tickers are not necessarily unique.',
          },
          {
            type: 'p',
            text: 'Always verify the contract address before trading.',
          },
        ],
      },
      {
        id: 'go-to-zero',
        question: 'Can a token go to zero?',
        answer: [
          { type: 'p', text: 'Yes.' },
          {
            type: 'p',
            text: 'A digital asset can lose all or effectively all of its market value.',
          },
          {
            type: 'p',
            text: 'Only interact with assets where you understand and can accept the risks.',
          },
        ],
      },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    faqs: [
      {
        id: 'stay-safe',
        question: 'How can I stay safe?',
        answer: [
          { type: 'p', text: 'Basic precautions include:' },
          {
            type: 'ul',
            items: [
              'use the official scoop.fun website;',
              'never share your seed phrase;',
              'never share your private key;',
              'verify transaction details before signing;',
              'check token contract addresses;',
              'be cautious of unsolicited messages;',
              'do not assume someone contacting you on social media represents SCOOP; and',
              'keep your wallet and device software updated.',
            ],
          },
        ],
      },
      {
        id: 'support-dms',
        question: 'Does SCOOP provide support through DMs?',
        answer: [
          {
            type: 'p',
            text: 'You may contact @scoopterminal through X, but you should remain cautious of impersonators.',
          },
          {
            type: 'p',
            emphasis: 'strong',
            text: 'We will never ask for your private key or seed phrase.',
          },
        ],
      },
      {
        id: 'seed-scam',
        question: 'Someone claiming to be SCOOP asked for my seed phrase.',
        answer: [
          { type: 'p', text: 'Do not provide it.' },
          {
            type: 'p',
            text: 'Anyone asking for your seed phrase or private key is attempting to gain control of your wallet.',
          },
          {
            type: 'p',
            text: "If you have already disclosed it, treat the wallet as compromised and follow your wallet provider's security guidance immediately.",
          },
        ],
      },
      {
        id: 'vulnerability',
        question: 'I found a security vulnerability.',
        answer: [
          {
            type: 'p',
            text: 'Please do not exploit or publicly disclose a suspected vulnerability.',
          },
          {
            type: 'p',
            text: 'Send the details privately to hi@scoop.fun and include Security in the subject line.',
          },
        ],
      },
    ],
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    faqs: [
      {
        id: 'not-loading',
        question: "SCOOP isn't loading correctly.",
        answer: [
          { type: 'p', text: 'Try:' },
          {
            type: 'ol',
            items: [
              'Refreshing the page.',
              'Checking your internet connection.',
              'Confirming your wallet is responsive.',
              'Disconnecting and reconnecting your wallet.',
              "Checking that you're on the correct network.",
              'Updating your browser.',
              'Trying a private/incognito browser window.',
            ],
          },
          {
            type: 'p',
            text: 'If SCOOP appears to be experiencing a wider outage, check @scoopterminal for updates.',
          },
        ],
      },
      {
        id: 'balance-wrong',
        question: 'A balance looks wrong.',
        answer: [
          {
            type: 'p',
            text: 'First compare the displayed balance with the underlying blockchain.',
          },
          {
            type: 'p',
            text: 'If the blockchain balance is correct but SCOOP displays something different, it may be an indexing or interface issue.',
          },
          {
            type: 'p',
            text: 'Contact us with your public wallet address and details of the affected token.',
          },
        ],
      },
      {
        id: 'still-not-working',
        question: "Something still isn't working.",
        answer: [
          { type: 'p', text: 'Send us:' },
          {
            type: 'ul',
            items: [
              'a short description of what you were trying to do;',
              'what happened instead;',
              'the transaction hash, if applicable;',
              'your public wallet address, if relevant;',
              'your wallet type and browser; and',
              'a screenshot if it helps explain the issue.',
            ],
          },
          {
            type: 'p',
            emphasis: 'strong',
            text: 'Never include a private key or seed phrase.',
          },
        ],
      },
    ],
  },
];
