import { LAUNCH_STEPS, LAUNCH_STEPS_PUMP, type LaunchStepId } from '@/lib/launch/types';
import { isPumpRail, type LaunchRail } from '@/lib/launch/launch-rail';

type Props = {
  step: LaunchStepId;
  launchRail?: LaunchRail;
};

export function LaunchProgress({ step, launchRail }: Props) {
  const steps = isPumpRail(launchRail) ? LAUNCH_STEPS_PUMP : LAUNCH_STEPS;
  const current = steps[step - 1]!;
  const progress = (step / steps.length) * 100;

  return (
    <div className="mb-5 md:mb-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-[var(--muted)]">
        {String(step).padStart(2, '0')} / 0{steps.length} — {current.key}
      </p>
      <div
        className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-[var(--divider)]"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={step}
        aria-label={`Launch step ${step} of ${steps.length}`}
      >
        <div
          className="h-full bg-[var(--scoop-green)] transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
