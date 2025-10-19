/**
 * High-resolution timing utilities
 */

export interface TimingResult {
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

/**
 * Start a high-resolution timer
 */
export function startTimer(): TimingResult {
  return {
    startTime: performance.now(),
  };
}

/**
 * End a timer and calculate duration
 */
export function endTimer(timer: TimingResult): TimingResult {
  const endTime = performance.now();
  const durationMs = endTime - timer.startTime;

  return {
    ...timer,
    endTime,
    durationMs,
  };
}

/**
 * Measure execution time of an async function
 */
export async function measureAsync<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const timer = startTimer();
  const result = await fn();
  const { durationMs } = endTimer(timer);

  return {
    result,
    durationMs: durationMs || 0,
  };
}

/**
 * Measure execution time of a synchronous function
 */
export function measureSync<T>(fn: () => T): { result: T; durationMs: number } {
  const timer = startTimer();
  const result = fn();
  const { durationMs } = endTimer(timer);

  return {
    result,
    durationMs: durationMs || 0,
  };
}
