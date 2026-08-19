/**
 * Unit Tests for switchAccount() function
 * Tests cover: success cases, error cases, API failures, network errors
 */

// ─── Test Setup ───────────────────────────────────────────────────────────────

// Mock Chrome APIs
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

// Set up global chrome mock
global.chrome = mockChrome as any;

// Mock fetch
global.fetch = jest.fn();

// Store the message listener for testing
let messageListener: any = null;

// Capture the listener when it's registered
mockChrome.runtime.onMessage.addListener.mockImplementation((listener: any) => {
  messageListener = listener;
});

// Import after mocks are set up
import '../background';

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Helper to access the switchAccount function via message handler
 */
async function callSwitchAccount(activationCode: string | null): Promise<any> {
  // Set up storage mock
  mockChrome.storage.local.get.mockResolvedValue(
    activationCode ? { activationCode } : {}
  );

  if (!messageListener) {
    throw new Error('Message listener not registered');
  }

  // Call the listener with switchAccount action
  return new Promise((resolve) => {
    messageListener(
      { action: 'switchAccount' },
      {},
      (response: any) => resolve(response)
    );
  });
}

/**
 * Reset all mocks before each test
 */
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

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe('switchAccount() - Success Cases', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should successfully switch account with valid activation code', async () => {
    const activationCode = 'TEST-1234-5678-ABCD';
    const sessionKey = 'sk_test_session_key_12345';
    const remainingUses = 99;

    // Mock storage to return activation code
    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({ apiEndpoint: 'https://api.example.com' });

    // Mock successful API response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses }),
    });

    // Mock cookie operations
    mockChrome.cookies.getAll.mockResolvedValue([
      { name: 'oldCookie', domain: '.claude.ai', path: '/' },
    ]);
    mockChrome.cookies.remove.mockResolvedValue({});
    mockChrome.cookies.set.mockResolvedValue({});

    // Mock tab operations
    mockChrome.tabs.query.mockResolvedValue([{ id: 1 }]);
    mockChrome.tabs.reload.mockResolvedValue(undefined);

    // Mock storage set
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(true);
    expect(response.remainingUses).toBe(remainingUses);
    expect(response.error).toBeUndefined();
  });

  test('should clear all cookies before setting new sessionKey', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_new';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 50 }),
    });

    const mockCookies = [
      { name: 'cookie1', domain: '.claude.ai', path: '/' },
      { name: 'cookie2', domain: 'claude.ai', path: '/chat' },
      { name: 'cookie3', domain: '.claude.ai', path: '/api' },
    ];

    mockChrome.cookies.getAll.mockResolvedValue(mockCookies);
    mockChrome.cookies.remove.mockResolvedValue({});
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    await callSwitchAccount(activationCode);

    // Verify all cookies were removed
    expect(mockChrome.cookies.remove).toHaveBeenCalledTimes(3);
    expect(mockChrome.cookies.remove).toHaveBeenCalledWith({
      url: 'https://www.claude.ai/',
      name: 'cookie1',
    });
    expect(mockChrome.cookies.remove).toHaveBeenCalledWith({
      url: 'https://claude.ai/chat',
      name: 'cookie2',
    });
  });

  test('should set sessionKey cookie with correct attributes', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test_12345';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    await callSwitchAccount(activationCode);

    // Verify cookie was set with correct attributes
    expect(mockChrome.cookies.set).toHaveBeenCalledWith({
      url: 'https://claude.ai',
      name: 'sessionKey',
      value: sessionKey,
      domain: '.claude.ai',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      expirationDate: expect.any(Number),
    });

    const cookieSetCall = mockChrome.cookies.set.mock.calls[0][0];
    const expiryDate = cookieSetCall.expirationDate;
    const expectedExpiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
    
    // Allow 5 second tolerance for test execution time
    expect(Math.abs(expiryDate - expectedExpiry)).toBeLessThan(5);
  });

  test('should refresh all claude.ai tabs after setting cookie', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 5 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    
    const mockTabs = [
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ];
    mockChrome.tabs.query.mockResolvedValue(mockTabs);
    mockChrome.tabs.reload.mockResolvedValue(undefined);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    await callSwitchAccount(activationCode);

    // Verify tabs were queried correctly
    expect(mockChrome.tabs.query).toHaveBeenCalledWith({
      url: 'https://claude.ai/*',
    });

    // Verify all tabs were reloaded
    expect(mockChrome.tabs.reload).toHaveBeenCalledTimes(3);
    expect(mockChrome.tabs.reload).toHaveBeenCalledWith(1);
    expect(mockChrome.tabs.reload).toHaveBeenCalledWith(2);
    expect(mockChrome.tabs.reload).toHaveBeenCalledWith(3);
  });

  test('should succeed when no claude.ai tabs are open', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]); // No tabs
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(true);
    expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
  });

  test('should update storage with lastSwitchTime and remainingUses', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';
    const remainingUses = 42;

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    const beforeTime = new Date().toISOString();
    await callSwitchAccount(activationCode);
    const afterTime = new Date().toISOString();

    expect(mockChrome.storage.local.set).toHaveBeenCalledWith({
      lastSwitchTime: expect.any(String),
      remainingUses,
    });

    const setCall = mockChrome.storage.local.set.mock.calls[0][0];
    const savedTime = setCall.lastSwitchTime;
    
    expect(savedTime >= beforeTime).toBe(true);
    expect(savedTime <= afterTime).toBe(true);
  });
});

describe('switchAccount() - Missing Activation Code', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should fail when activation code is not configured', async () => {
    const response = await callSwitchAccount(null);

    expect(response.success).toBe(false);
    expect(response.error).toBe('请先在选项页面配置激活码');
    
    // Should not call API
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('should not modify cookies when activation code is missing', async () => {
    await callSwitchAccount(null);

    expect(mockChrome.cookies.getAll).not.toHaveBeenCalled();
    expect(mockChrome.cookies.remove).not.toHaveBeenCalled();
    expect(mockChrome.cookies.set).not.toHaveBeenCalled();
  });
});

describe('switchAccount() - API Failures', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should handle invalid activation code (401)', async () => {
    const activationCode = 'INVALID-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'Invalid activation code',
        reason: 'invalid_code',
      }),
    });

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Invalid activation code');
    expect(response.reason).toBe('invalid_code');
  });

  test('should handle expired activation code (401)', async () => {
    const activationCode = 'EXPIRED-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'Activation code has expired',
        reason: 'expired',
      }),
    });

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Activation code has expired');
    expect(response.reason).toBe('expired');
  });

  test('should handle no remaining uses (401)', async () => {
    const activationCode = 'NO-USES-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'No remaining uses',
        reason: 'no_uses_left',
      }),
    });

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toBe('No remaining uses');
    expect(response.reason).toBe('no_uses_left');
  });

  test('should handle disabled activation code (401)', async () => {
    const activationCode = 'DISABLED-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: 'Activation code is disabled',
        reason: 'disabled',
      }),
    });

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Activation code is disabled');
    expect(response.reason).toBe('disabled');
  });

  test('should handle server error (500)', async () => {
    const activationCode = 'TEST-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        error: 'Internal server error',
      }),
    });

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Internal server error');
  });

  test('should handle HTTP error without JSON body', async () => {
    const activationCode = 'TEST-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('Not JSON');
      },
    });

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toBe('HTTP 503');
  });

  test('should not modify cookies when API fails', async () => {
    const activationCode = 'INVALID-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid', reason: 'invalid_code' }),
    });

    await callSwitchAccount(activationCode);

    expect(mockChrome.cookies.getAll).not.toHaveBeenCalled();
    expect(mockChrome.cookies.set).not.toHaveBeenCalled();
  });
});

describe('switchAccount() - Network Errors', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should handle network timeout', async () => {
    const activationCode = 'TEST-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    // Simulate timeout
    (global.fetch as jest.Mock).mockImplementation(() => {
      return new Promise((_, reject) => {
        const error = new Error('Request timed out');
        error.name = 'AbortError';
        setTimeout(() => reject(error), 100);
      });
    });

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toBe('请求超时，请检查网络连接');
  });

  test('should handle network failure', async () => {
    const activationCode = 'TEST-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockRejectedValue(
      new Error('Network request failed')
    );

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toBe('Network request failed');
  });

  test('should handle DNS resolution failure', async () => {
    const activationCode = 'TEST-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockRejectedValue(
      new Error('getaddrinfo ENOTFOUND api.example.com')
    );

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toContain('ENOTFOUND');
  });

  test('should handle connection refused', async () => {
    const activationCode = 'TEST-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockRejectedValue(
      new Error('connect ECONNREFUSED 127.0.0.1:443')
    );

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toContain('ECONNREFUSED');
  });
});

describe('switchAccount() - Edge Cases', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should handle empty cookie list', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]); // Empty
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(true);
    expect(mockChrome.cookies.remove).not.toHaveBeenCalled();
  });

  test('should handle tab without id', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    
    // Tab without id
    mockChrome.tabs.query.mockResolvedValue([{ id: undefined }]);
    mockChrome.tabs.reload.mockResolvedValue(undefined);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(true);
    expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
  });

  test('should continue on cookie removal failure', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    const mockCookies = [
      { name: 'cookie1', domain: '.claude.ai', path: '/' },
      { name: 'cookie2', domain: '.claude.ai', path: '/' },
    ];

    mockChrome.cookies.getAll.mockResolvedValue(mockCookies);
    
    // First removal fails, second succeeds
    mockChrome.cookies.remove
      .mockRejectedValueOnce(new Error('Cookie removal failed'))
      .mockResolvedValueOnce({});
    
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    const response = await callSwitchAccount(activationCode);

    // Should still succeed
    expect(response.success).toBe(true);
    expect(mockChrome.cookies.remove).toHaveBeenCalledTimes(2);
  });

  test('should continue on tab reload failure', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    
    const mockTabs = [{ id: 1 }, { id: 2 }];
    mockChrome.tabs.query.mockResolvedValue(mockTabs);
    
    // First reload fails, second succeeds
    mockChrome.tabs.reload
      .mockRejectedValueOnce(new Error('Tab closed'))
      .mockResolvedValueOnce(undefined);
    
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    const response = await callSwitchAccount(activationCode);

    // Should still succeed
    expect(response.success).toBe(true);
    expect(mockChrome.tabs.reload).toHaveBeenCalledTimes(2);
  });

  test('should use custom API endpoint from storage', async () => {
    const activationCode = 'TEST-CODE';
    const customEndpoint = 'https://custom-api.example.com';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({ apiEndpoint: customEndpoint });

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    await callSwitchAccount(activationCode);

    expect(global.fetch).toHaveBeenCalledWith(
      `${customEndpoint}/api/session-key`,
      expect.any(Object)
    );
  });

  test('should handle cookie set failure', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockRejectedValue(
      new Error('Failed to set cookie')
    );

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toContain('设置 sessionKey cookie 失败');
  });

  test('should handle cookies.getAll failure gracefully', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    // cookies.getAll fails
    mockChrome.cookies.getAll.mockRejectedValue(
      new Error('Permission denied')
    );
    
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    const response = await callSwitchAccount(activationCode);

    // Should still succeed (continues after error)
    expect(response.success).toBe(true);
  });
});

describe('switchAccount() - API Request Details', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should send correct request headers and body', async () => {
    const activationCode = 'TEST-1234-ABCD-5678';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    await callSwitchAccount(activationCode);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/session-key',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activationCode }),
        signal: expect.any(AbortSignal),
      }
    );
  });

  test('should include abort signal for timeout', async () => {
    const activationCode = 'TEST-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    let capturedSignal: AbortSignal | null = null;

    (global.fetch as jest.Mock).mockImplementation((url, options) => {
      capturedSignal = options.signal;
      return Promise.resolve({
        ok: true,
        json: async () => ({ sessionKey: 'sk_test', remainingUses: 10 }),
      });
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]);
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    await callSwitchAccount(activationCode);

    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('Message Handler - getStatus Action', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should return status data successfully', async () => {
    const lastSwitchTime = '2024-01-15T10:30:00.000Z';
    const remainingUses = 42;

    mockChrome.storage.local.get.mockResolvedValue({
      lastSwitchTime,
      remainingUses,
    });

    if (!messageListener) {
      throw new Error('Message listener not registered');
    }

    const response = await new Promise((resolve) => {
      messageListener(
        { action: 'getStatus' },
        {},
        (response: any) => resolve(response)
      );
    });

    expect(response).toEqual({
      success: true,
      data: {
        lastSwitchTime,
        remainingUses,
      },
    });
  });

  test('should handle storage error when getting status', async () => {
    mockChrome.storage.local.get.mockRejectedValue(
      new Error('Storage access denied')
    );

    if (!messageListener) {
      throw new Error('Message listener not registered');
    }

    const response = await new Promise((resolve) => {
      messageListener(
        { action: 'getStatus' },
        {},
        (response: any) => resolve(response)
      );
    });

    expect(response).toEqual({
      success: false,
      error: 'Storage access denied',
    });
  });
});

describe('Message Handler - Unknown Actions', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should handle unknown action', async () => {
    if (!messageListener) {
      throw new Error('Message listener not registered');
    }

    const response = await new Promise((resolve) => {
      messageListener(
        { action: 'unknownAction' },
        {},
        (response: any) => resolve(response)
      );
    });

    expect(response).toEqual({
      success: false,
      error: '未知操作',
    });
  });

  test('should handle message with no action', async () => {
    if (!messageListener) {
      throw new Error('Message listener not registered');
    }

    const response = await new Promise((resolve) => {
      messageListener(
        {},
        {},
        (response: any) => resolve(response)
      );
    });

    expect(response).toEqual({
      success: false,
      error: '未知操作',
    });
  });
});

describe('Message Handler - tabs.query Failure', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should handle tabs.query failure gracefully', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    
    // tabs.query fails
    mockChrome.tabs.query.mockRejectedValue(
      new Error('No permission to query tabs')
    );
    
    mockChrome.storage.local.set.mockResolvedValue(undefined);

    const response = await callSwitchAccount(activationCode);

    // Should still succeed (continues after error)
    expect(response.success).toBe(true);
    expect(mockChrome.tabs.reload).not.toHaveBeenCalled();
  });
});

describe('Message Handler - Exception Handling', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should handle storage.local.get throwing non-Error exception in switchAccount', async () => {
    const activationCode = 'TEST-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockRejectedValueOnce('String error instead of Error object'); // Non-Error exception

    if (!messageListener) {
      throw new Error('Message listener not registered');
    }

    const response = await new Promise((resolve) => {
      messageListener(
        { action: 'switchAccount' },
        {},
        (response: any) => resolve(response)
      );
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe('账号切换失败');
  });

  test('should handle fetch throwing non-Error exception', async () => {
    const activationCode = 'TEST-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    // Simulate non-Error exception
    (global.fetch as jest.Mock).mockRejectedValue('Non-Error exception');

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toBe('账号切换失败');
  });

  test('should catch exceptions from handleMessage and respond with error', async () => {
    // Force chrome.storage.local.get to throw during message handling
    mockChrome.storage.local.get.mockImplementation(() => {
      throw new Error('Storage access error');
    });

    if (!messageListener) {
      throw new Error('Message listener not registered');
    }

    const response = await new Promise((resolve) => {
      messageListener(
        { action: 'switchAccount' },
        {},
        (response: any) => resolve(response)
      );
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe('Storage access error');
  });

  test('should handle non-Error exception in handleMessage catch block', async () => {
    // Force a non-Error exception
    mockChrome.storage.local.get.mockImplementation(() => {
      throw 'String exception'; // Non-Error object
    });

    if (!messageListener) {
      throw new Error('Message listener not registered');
    }

    const response = await new Promise((resolve) => {
      messageListener(
        { action: 'switchAccount' },
        {},
        (response: any) => resolve(response)
      );
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe('Unknown error');
  });
});

describe('switchAccount() - Additional Error Scenarios', () => {
  beforeEach(() => {
    resetMocks();
  });

  test('should handle response.json() throwing exception for error responses', async () => {
    const activationCode = 'TEST-CODE';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    const response = await callSwitchAccount(activationCode);

    expect(response.success).toBe(false);
    expect(response.error).toBe('HTTP 400');
  });

  test('should handle storage.local.set failure after successful switch', async () => {
    const activationCode = 'TEST-CODE';
    const sessionKey = 'sk_test';

    mockChrome.storage.local.get
      .mockResolvedValueOnce({ activationCode })
      .mockResolvedValueOnce({});

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ sessionKey, remainingUses: 10 }),
    });

    mockChrome.cookies.getAll.mockResolvedValue([]);
    mockChrome.cookies.set.mockResolvedValue({});
    mockChrome.tabs.query.mockResolvedValue([]);
    
    // storage.local.set fails
    mockChrome.storage.local.set.mockRejectedValue(
      new Error('Storage quota exceeded')
    );

    const response = await callSwitchAccount(activationCode);

    // Should fail because storage.local.set is critical
    expect(response.success).toBe(false);
    expect(response.error).toBe('Storage quota exceeded');
  });
});
