/**
 * Shared Chrome API mock helper.
 *
 * Usage in a test file:
 *
 *   import { createMockChrome } from './__mocks__/chrome';
 *
 *   const mockChrome = createMockChrome();
 *   global.chrome = mockChrome as any;
 *
 * Call `resetMockChrome(mockChrome)` in beforeEach to clear all call histories.
 */

export interface MockChrome {
  runtime: {
    sendMessage: jest.Mock;
    openOptionsPage: jest.Mock;
    onMessage: {
      addListener: jest.Mock;
    };
  };
  storage: {
    local: {
      get: jest.Mock;
      set: jest.Mock;
    };
  };
  cookies: {
    getAll: jest.Mock;
    remove: jest.Mock;
    set: jest.Mock;
  };
  tabs: {
    query: jest.Mock;
    reload: jest.Mock;
  };
}

/**
 * Creates a fresh MockChrome object with all methods as jest.fn().
 */
export function createMockChrome(): MockChrome {
  return {
    runtime: {
      sendMessage: jest.fn(),
      openOptionsPage: jest.fn(),
      onMessage: {
        addListener: jest.fn(),
      },
    },
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
  };
}

/**
 * Resets all mock functions on the given MockChrome instance.
 * Equivalent to calling jest.fn().mockReset() on every method.
 */
export function resetMockChrome(mock: MockChrome): void {
  mock.runtime.sendMessage.mockReset();
  mock.runtime.openOptionsPage.mockReset();
  mock.runtime.onMessage.addListener.mockReset();
  mock.storage.local.get.mockReset();
  mock.storage.local.set.mockReset();
  mock.cookies.getAll.mockReset();
  mock.cookies.remove.mockReset();
  mock.cookies.set.mockReset();
  mock.tabs.query.mockReset();
  mock.tabs.reload.mockReset();
}
