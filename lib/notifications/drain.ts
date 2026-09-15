/**
 * Draining the queue right after the thing that filled it.
 *
 * Iron rule #6 stands: nothing here sends a LINE message, it only asks the
 * worker to run. Every message still goes through notification_queue with a
 * dedupe key, and the cron remains the thing that guarantees delivery.
 *
 * Why it exists: on Vercel Hobby a cron may run at most once a day, so the
 * queue was drained at 08:00 Bangkok and nothing in between. A customer who
 * booked at 19:00 got their confirmation the next morning, and an alert to the
 * shop about a cancellation would have arrived long after the empty chair.
 * `after()` runs this once the response has been sent, so the customer waits
 * for nothing and the message goes out in seconds.
 *
 * A failure here is not an error: the row stays pending and the cron picks it
 * up. That is the whole reason the queue is durable.
 */
import { after } from 'next/server';
import { processTenant } from './worker';

export function drainSoon(tenantId: string): void {
  try {
    after(async () => {
      try {
        await processTenant(tenantId);
      } catch (error) {
        console.error('[notifications] opportunistic drain failed', error);
      }
    });
  } catch {
    // Called outside a request scope — a script or a test. The cron covers it.
  }
}
