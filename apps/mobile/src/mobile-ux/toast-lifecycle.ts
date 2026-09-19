type ToastTimerApi = {
  setTimeout: (callback: () => void, durationMs: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void;
};

export function scheduleToastDismiss(
  message: string | null,
  onDismiss: (() => void) | undefined,
  durationMs: number,
  timers: ToastTimerApi = globalThis,
) {
  if (!message || !onDismiss) return () => undefined;
  const timer = timers.setTimeout(onDismiss, durationMs);
  return () => timers.clearTimeout(timer);
}
