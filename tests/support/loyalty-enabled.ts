/**
 * Run a test file as though loyalty had launched.
 *
 * `LOYALTY_ENABLED` is false while the feature is hidden, and `enqueue` drops
 * every loyalty message because of it. The loyalty suites assert that those
 * messages *are* queued — which is the behaviour that has to keep working, so
 * the day the flag flips there are no surprises. Suppression itself is pinned
 * separately, in tests/unit/features.test.ts.
 *
 * Import this for its side effect, before anything that reaches `enqueue`:
 *
 *   import '../support/loyalty-enabled';
 */
import { vi } from 'vitest';

vi.mock('@/lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/features')>()),
  LOYALTY_ENABLED: true,
}));
