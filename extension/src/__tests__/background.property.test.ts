/**
 * Property-Based Tests for clearClaudeCookies() idempotence
 *
 * **Validates: Requirements 6.7, 6.8, 6.9**
 *
 * Properties tested:
 * 1. For any arbitrary list of claude.ai cookies, clearing them always results in all cookies removed
 * 2. The number of remove() calls equals the number of cookies
 * 3. Clearing an empty cookie list is always safe (no errors, no calls)
 * 4. After clearing, calling clearClaudeCookies() again makes 0 remove() calls (idempotence)
 * 5. Cookie names with arbitrary characters are still passed correctly to remove()
 */

import * as fc from 'fast-check';

// ─── Chrome API Mock ──────────────────────────────────────────────────────────

const mockChrome = {
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn(),
    },
  },
  cookies: {
    getAll: jest.fn(),
    remove: jest.fn(),
    set: jest.fn(),
  },
  tabs: {
    query: jest.fn(),
    reload: jest.fn(),
  },
  runtime: {
    onMessage: {
      addListener: jest.fn(),
    },
  },
};

global.chrome = mockChrome as any;
global.fetch = jest.fn();

// Import background after mocks are set up — this registers the message listener
// and makes clearClaudeCookies accessible indirectly through the message handler.
// We test clearClaudeCookies via a helper that drives it through the switchAccount flow
// (post successful API call) or by re-exporting it. Since the function is not exported,
// we drive it through message handler + mocked API, which is the same approach as
// background.test.ts.
import '../background';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let messageListener: (msg: any, sender: any, respond: (r: any) => void) => void;

mockChrome.runtime.onMessage.addListener.mockImplementation((listener: any) => {
  messageListener = listener;
});

// Re-import to capture the listener (the import above already ran the module)
// The listener was captured when the module loaded above.

function resetMocks(): void {
  jest.clearAllMocks();
  (global.fetch as jest.Mock).mockReset();
  mockChrome.storage.local.get.mockReset();
  mockChrome.storage.local.set.mockReset();
  mockChrome.cookies.getAll.mockReset();
  mockChrome.cookies.remove.mockReset();
  mockChrome.cookies.set.mockReset();
  mockChrome.tabs.query.mockReset();
  mockChrome.tabs.reload.mockReset();
}

/**
 * Trigger clearClaudeCookies() by driving a full successful switchAccount()
 * message. The cookies.getAll mock controls which cookies will be cleared.
 */
async function triggerClearCookies(): Promise<void> {
  mockChrome.storage.local.get
    .mockResolvedValueOnce({ activationCode: 'TEST-CODE-PROPERTY' })
    .mockResolvedValueOnce({});
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ sessionKey: 'sk_prop_test', remainingUses: 99 }),
  });
  mockChrome.cookies.set.mockResolvedValue({});
  mockChrome.tabs.query.mockResolvedValue([]);
  mockChrome.storage.local.set.mockResolvedValue(undefined);

  await new Promise<void>((resolve) => {
    messageListener(
      { action: 'switchAccount' },
      {},
      () => resolve(),
    );
  });
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a realistic chrome.cookies.Cookie-like object for claude.ai
 */
const claudeCookieArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 64 }),
  value: fc.string({ maxLength: 128 }),
  domain: fc.constantFrom('.claude.ai', 'claude.ai', 'www.claude.ai'),
  path: fc.oneof(
    fc.constant('/'),
    fc.constant('/api'),
    fc.constant('/chat'),
    fc.string({ minLength: 1, maxLength: 32 }).map((s) => `/${s.replace(/[^a-z0-9]/gi, 'x')}`),
  ),
  secure: fc.boolean(),
  httpOnly: fc.boolean(),
  session: fc.boolean(),
  hostOnly: fc.boolean(),
  sameSite: fc.constantFrom('lax', 'strict', 'no_restriction', 'unspecified'),
  storeId: fc.constant('0'),
  expirationDate: fc.option(fc.nat(), { nil: undefined }),
});

/**
 * Generates cookie names that include spaces, special characters, and unicode
 */
const exoticNameCookieArb = fc.record({
  name: fc.oneof(
    fc.string({ minLength: 1, maxLength: 32 }), // arbitrary strings including special chars
    fc.fullUnicodeString({ minLength: 1, maxLength: 20 }),
    fc.constant('cookie with spaces'),
    fc.constant('cookie=with=equals'),
    fc.constant('cookie;semicolon'),
    fc.constant('émoji🍪cookie'),
    fc.constant('中文cookie'),
  ),
  value: fc.string({ maxLength: 64 }),
  domain: fc.constant('.claude.ai'),
  path: fc.constant('/'),
  secure: fc.constant(true),
  httpOnly: fc.constant(false),
  session: fc.constant(false),
  hostOnly: fc.constant(false),
  sameSite: fc.constant('lax' as const),
  storeId: fc.constant('0'),
  expirationDate: fc.constant(undefined),
});

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('clearClaudeCookies() - Property-Based Tests', () => {
  // Recapture listener after module loads
  beforeAll(() => {
    // The listener is set when the module is first imported.
    // mockImplementation was set before import, so the listener should have been captured.
    // If not, reset and let the mock capture it.
    if (!messageListener) {
      mockChrome.runtime.onMessage.addListener.mock.calls.forEach(([listener]: [any]) => {
        messageListener = listener;
      });
    }
  });

  beforeEach(() => {
    resetMocks();
  });

  // ── Property 1 ─────────────────────────────────────────────────────────────
  test(
    'Property 1: for any list of claude.ai cookies, all cookies are removed',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(claudeCookieArb, { minLength: 0, maxLength: 20 }),
          async (cookies) => {
            resetMocks();

            mockChrome.cookies.getAll.mockResolvedValue(cookies);
            mockChrome.cookies.remove.mockResolvedValue({});

            await triggerClearCookies();

            // Every cookie in the list must have a corresponding remove() call
            expect(mockChrome.cookies.remove).toHaveBeenCalledTimes(cookies.length);

            const removedNames = mockChrome.cookies.remove.mock.calls.map(
              ([{ name }]: [{ name: string }]) => name,
            );
            for (const cookie of cookies) {
              expect(removedNames).toContain(cookie.name);
            }
          },
        ),
        { numRuns: 100, verbose: false },
      );
    },
    30_000,
  );

  // ── Property 2 ─────────────────────────────────────────────────────────────
  test(
    'Property 2: number of remove() calls equals number of cookies',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(claudeCookieArb, { minLength: 0, maxLength: 30 }),
          async (cookies) => {
            resetMocks();

            mockChrome.cookies.getAll.mockResolvedValue(cookies);
            mockChrome.cookies.remove.mockResolvedValue({});

            await triggerClearCookies();

            expect(mockChrome.cookies.remove).toHaveBeenCalledTimes(cookies.length);
          },
        ),
        { numRuns: 100, verbose: false },
      );
    },
    30_000,
  );

  // ── Property 3 ─────────────────────────────────────────────────────────────
  test(
    'Property 3: clearing an empty cookie list is always safe — no errors, no remove() calls',
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.constant([]), async (emptyCookies) => {
          resetMocks();

          mockChrome.cookies.getAll.mockResolvedValue(emptyCookies);
          mockChrome.cookies.remove.mockResolvedValue({});

          // Must not throw
          await expect(triggerClearCookies()).resolves.not.toThrow();

          expect(mockChrome.cookies.remove).not.toHaveBeenCalled();
        }),
        { numRuns: 100, verbose: false },
      );
    },
    30_000,
  );

  // ── Property 4 ─────────────────────────────────────────────────────────────
  test(
    'Property 4: idempotence — after clearing, a second clearClaudeCookies() makes 0 remove() calls',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(claudeCookieArb, { minLength: 0, maxLength: 20 }),
          async (cookies) => {
            resetMocks();

            // First call: cookies exist
            mockChrome.cookies.getAll.mockResolvedValueOnce(cookies);
            mockChrome.cookies.remove.mockResolvedValue({});

            await triggerClearCookies();

            const firstCallCount = mockChrome.cookies.remove.mock.calls.length;
            expect(firstCallCount).toBe(cookies.length);

            // Second call: cookies are gone (getAll returns [])
            resetMocks();
            mockChrome.cookies.getAll.mockResolvedValueOnce([]);
            mockChrome.cookies.remove.mockResolvedValue({});

            await triggerClearCookies();

            // Idempotence: second call makes 0 remove() calls
            expect(mockChrome.cookies.remove).toHaveBeenCalledTimes(0);
          },
        ),
        { numRuns: 100, verbose: false },
      );
    },
    30_000,
  );

  // ── Property 5 ─────────────────────────────────────────────────────────────
  test(
    'Property 5: cookie names with arbitrary/exotic characters are passed correctly to remove()',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(exoticNameCookieArb, { minLength: 1, maxLength: 15 }),
          async (cookies) => {
            resetMocks();

            mockChrome.cookies.getAll.mockResolvedValue(cookies);
            mockChrome.cookies.remove.mockResolvedValue({});

            await triggerClearCookies();

            expect(mockChrome.cookies.remove).toHaveBeenCalledTimes(cookies.length);

            // Each remove() call must carry the exact name of the original cookie
            const removeCalls = mockChrome.cookies.remove.mock.calls as Array<[{ name: string; url: string }]>;
            const removedNames = removeCalls.map(([{ name }]) => name);

            for (const cookie of cookies) {
              expect(removedNames).toContain(cookie.name);
            }
          },
        ),
        { numRuns: 100, verbose: false },
      );
    },
    30_000,
  );
});
