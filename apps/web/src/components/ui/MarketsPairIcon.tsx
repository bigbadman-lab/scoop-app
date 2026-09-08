type Props = {
  className?: string;
};

/** Simple paired-markets mark for the Stocks + ETH badge (no extra asset file). */
export function MarketsPairIcon({ className = 'h-5 w-5' }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 16.5 9 11l3.5 3.5L20 7" />
      <path d="M15 7h5v5" />
    </svg>
  );
}
