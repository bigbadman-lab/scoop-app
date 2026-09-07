import { LAUNCH_STEPS, type LaunchStepId } from '@/lib/launch/types';

type Props = {
  step: LaunchStepId;
};

export function LaunchProgress({ step }: Props) {
  const current = LAUNCH_STEPS[step - 1]!;
  const progress = (step / LAUNCH_STEPS.length) * 100;

  return (
    <div className="mb-5 md:mb-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
        {String(step).padStart(2, '0')} / 0{LAUNCH_STEPS.length} — {current.key}
      </p>
      <div
        className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-[var(--divider)]"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={step}
        aria-label={`Launch step ${step} of 4`}
      >
        <div
          className="h-full bg-[var(--scoop-orange)] transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
