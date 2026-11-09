// Per-business serialisation: one job at a time per business, whatever the channel (WhatsApp inbound
// messages, WhatsApp agent turns, web chat turns). Lives in memory: one backend process.

const queues = new Map<string, Promise<void>>();

/**
 * Runs `job` after every job already queued for this business. The returned promise settles with the
 * job; a failed job is logged and never blocks the ones behind it. Callers may ignore the promise.
 */
export function enqueue<T>(businessId: string, job: () => Promise<T>): Promise<T> {
  const prev = queues.get(businessId) ?? Promise.resolve();
  const run = prev.then(job);
  const next = run.then(
    () => undefined,
    (e) => console.error(`[queue] job failed for ${businessId}:`, e),
  );
  queues.set(businessId, next);
  void next.finally(() => {
    if (queues.get(businessId) === next) queues.delete(businessId);
  });
  return run;
}

/** Whether a business has queued or running jobs (tests and diagnostics). */
export function isBusy(businessId: string): boolean {
  return queues.has(businessId);
}
