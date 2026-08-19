/**
 * Unit Tests for Popup UI Controller
 * Tests cover: updateStatus states, button click, error mapping, options link, init/storage loading
 */

// ─── DOM Setup Helpers ────────────────────────────────────────────────────────

function setupDOM(): void {
  document.body.innerHTML = `
    <div id="status" class="status status-idle"></div>
    <p id="statusMessage">准备切换账号</p>
    <p id="remainingUses"></p>
    <button id="switchButton">切换账号</button>
    <span id="spinner" hidden></span>
    <a id="optionsLink" href="#">⚙ 配置激活码</a>
  `;
}

// ─── Chrome Mock ──────────────────────────────────────────────────────────────

const mockSendMessage = jest.fn();
const mockOpenOptionsPage = jest.fn();
const mockStorageGet = jest.fn();

const mockChrome = {
  runtime: {
    sendMessage: mockSendMessage,
    openOptionsPage: mockOpenOptionsPage,
  },
  storage: {
    local: {
      get: mockStorageGet,
    },
  },
};

global.chrome = mockChrome as any;

// ─── Module Import ────────────────────────────────────────────────────────────

// Helper: fire DOMContentLoaded after DOM is ready and popup module is loaded
function fireDOMContentLoaded(): void {
  const event = new Event('DOMContentLoaded');
  document.dispatchEvent(event);
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe('Popup - updateStatus: loading state', () => {
  beforeEach(() => {
    setupDOM();
    jest.resetModules();
    jest.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
  });

  test('sets status class to status-loading', async () => {
    const { updateStatus } = await import('../popup');
    updateStatus('loading', '切换中，请稍候…');
    const statusDiv = document.getElementById('status')!;
    expect(statusDiv.className).toBe('status status-loading');
  });

  test('disables switchButton', async () => {
    const { updateStatus } = await import('../popup');
    updateStatus('loading', '切换中，请稍候…');
    const btn = document.getElementById('switchButton') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  test('shows spinner', async () => {
    const { updateStatus } = await import('../popup');
    updateStatus('loading', '切换中，请稍候…');
    const spinner = document.getElementById('spinner') as HTMLSpanElement;
    expect(spinner.hidden).toBe(false);
  });

  test('sets statusMessage text', async () => {
    const { updateStatus } = await import('../popup');
    updateStatus('loading', '切换中，请稍候…');
    const msg = document.getElementById('statusMessage')!;
    expect(msg.textContent).toBe('切换中，请稍候…');
  });
});

describe('Popup - updateStatus: success state', () => {
  beforeEach(() => {
    setupDOM();
    jest.resetModules();
    jest.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
  });

  test('sets status class to status-success', async () => {
    const { updateStatus } = await import('../popup');
    updateStatus('success', '账号切换成功！', 42);
    const statusDiv = document.getElementById('status')!;
    expect(statusDiv.className).toBe('status status-success');
  });

  test('enables switchButton', async () => {
    const { updateStatus } = await import('../popup');
    // First disable it
    const btn = document.getElementById('switchButton') as HTMLButtonElement;
    btn.disabled = true;
    updateStatus('success', '账号切换成功！', 42);
    expect(btn.disabled).toBe(false);
  });

  test('hides spinner', async () => {
    const { updateStatus } = await import('../popup');
    const spinner = document.getElementById('spinner') as HTMLSpanElement;
    spinner.hidden = false;
    updateStatus('success', '账号切换成功！', 42);
    expect(spinner.hidden).toBe(true);
  });

  test('shows remaining uses text when remainingUses provided', async () => {
    const { updateStatus } = await import('../popup');
    updateStatus('success', '账号切换成功！', 99);
    const remainingEl = document.getElementById('remainingUses')!;
    expect(remainingEl.textContent).toBe('剩余使用次数：99');
  });

  test('shows remaining uses 0', async () => {
    const { updateStatus } = await import('../popup');
    updateStatus('success', '账号切换成功！', 0);
    const remainingEl = document.getElementById('remainingUses')!;
    expect(remainingEl.textContent).toBe('剩余使用次数：0');
  });
});

describe('Popup - updateStatus: error state', () => {
  beforeEach(() => {
    setupDOM();
    jest.resetModules();
    jest.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
  });

  test('sets status class to status-error', async () => {
    const { updateStatus } = await import('../popup');
    updateStatus('error', '无效的激活码，请检查配置');
    const statusDiv = document.getElementById('status')!;
    expect(statusDiv.className).toBe('status status-error');
  });

  test('enables switchButton', async () => {
    const { updateStatus } = await import('../popup');
    const btn = document.getElementById('switchButton') as HTMLButtonElement;
    btn.disabled = true;
    updateStatus('error', '无效的激活码，请检查配置');
    expect(btn.disabled).toBe(false);
  });

  test('hides spinner', async () => {
    const { updateStatus } = await import('../popup');
    const spinner = document.getElementById('spinner') as HTMLSpanElement;
    spinner.hidden = false;
    updateStatus('error', '无效的激活码，请检查配置');
    expect(spinner.hidden).toBe(true);
  });

  test('sets error message text', async () => {
    const { updateStatus } = await import('../popup');
    updateStatus('error', '无效的激活码，请检查配置');
    const msg = document.getElementById('statusMessage')!;
    expect(msg.textContent).toBe('无效的激活码，请检查配置');
  });
});

describe('Popup - mapErrorMessage', () => {
  beforeEach(() => {
    setupDOM();
    jest.resetModules();
    jest.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
  });

  test('maps invalid_code to correct message', async () => {
    const { mapErrorMessage } = await import('../popup');
    expect(mapErrorMessage(undefined, 'invalid_code')).toBe('无效的激活码，请检查配置');
  });

  test('maps expired to correct message', async () => {
    const { mapErrorMessage } = await import('../popup');
    expect(mapErrorMessage(undefined, 'expired')).toBe('激活码已过期，请联系管理员');
  });

  test('maps no_uses_left to correct message', async () => {
    const { mapErrorMessage } = await import('../popup');
    expect(mapErrorMessage(undefined, 'no_uses_left')).toBe('激活码使用次数已耗尽');
  });

  test('maps disabled to correct message', async () => {
    const { mapErrorMessage } = await import('../popup');
    expect(mapErrorMessage(undefined, 'disabled')).toBe('激活码已被禁用');
  });

  test('uses error string for unknown reason', async () => {
    const { mapErrorMessage } = await import('../popup');
    expect(mapErrorMessage('切换失败', 'unknown_reason')).toBe('切换失败');
  });

  test('falls back to default message when no error and unknown reason', async () => {
    const { mapErrorMessage } = await import('../popup');
    expect(mapErrorMessage(undefined, undefined)).toBe('切换失败，请重试');
  });

  test('falls back to default when reason is empty string', async () => {
    const { mapErrorMessage } = await import('../popup');
    expect(mapErrorMessage(undefined, '')).toBe('切换失败，请重试');
  });
});

describe('Popup - Button click sends message', () => {
  beforeEach(() => {
    setupDOM();
    jest.resetModules();
    jest.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
  });

  test('calls chrome.runtime.sendMessage with switchAccount action on button click', async () => {
    mockSendMessage.mockResolvedValue({ success: true, remainingUses: 5 });
    await import('../popup');
    fireDOMContentLoaded();
    // Wait for initialize() async
    await new Promise(resolve => setTimeout(resolve, 10));

    const btn = document.getElementById('switchButton') as HTMLButtonElement;
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(mockSendMessage).toHaveBeenCalledWith({ action: 'switchAccount' });
  });

  test('on success response updates status to success with remainingUses', async () => {
    mockSendMessage.mockResolvedValue({ success: true, remainingUses: 88 });
    await import('../popup');
    fireDOMContentLoaded();
    await new Promise(resolve => setTimeout(resolve, 10));

    const btn = document.getElementById('switchButton') as HTMLButtonElement;
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    const statusDiv = document.getElementById('status')!;
    expect(statusDiv.className).toBe('status status-success');
    const remainingEl = document.getElementById('remainingUses')!;
    expect(remainingEl.textContent).toBe('剩余使用次数：88');
  });

  test('on error response with invalid_code shows friendly message', async () => {
    mockSendMessage.mockResolvedValue({
      success: false,
      error: 'Invalid code',
      reason: 'invalid_code',
    });
    await import('../popup');
    fireDOMContentLoaded();
    await new Promise(resolve => setTimeout(resolve, 10));

    const btn = document.getElementById('switchButton') as HTMLButtonElement;
    btn.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    const statusDiv = document.getElementById('status')!;
    expect(statusDiv.className).toBe('status status-error');
    const msg = document.getElementById('statusMessage')!;
    expect(msg.textContent).toBe('无效的激活码，请检查配置');
  });

  test('on error response with expired shows friendly message', async () => {
    mockSendMessage.mockResolvedValue({
      success: false,
      error: 'Code expired',
      reason: 'expired',
    });
    await import('../popup');
    fireDOMContentLoaded();
    await new Promise(resolve => setTimeout(resolve, 10));

    document.getElementById('switchButton')!.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    const msg = document.getElementById('statusMessage')!;
    expect(msg.textContent).toBe('激活码已过期，请联系管理员');
  });

  test('on sendMessage throw updates status to error', async () => {
    mockSendMessage.mockRejectedValue(new Error('Extension context invalid'));
    await import('../popup');
    fireDOMContentLoaded();
    await new Promise(resolve => setTimeout(resolve, 10));

    document.getElementById('switchButton')!.click();
    await new Promise(resolve => setTimeout(resolve, 50));

    const statusDiv = document.getElementById('status')!;
    expect(statusDiv.className).toBe('status status-error');
    const msg = document.getElementById('statusMessage')!;
    expect(msg.textContent).toContain('Extension context invalid');
  });
});

describe('Popup - Options link click', () => {
  beforeEach(() => {
    setupDOM();
    jest.resetModules();
    jest.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
  });

  test('calls chrome.runtime.openOptionsPage on options link click', async () => {
    await import('../popup');
    fireDOMContentLoaded();
    await new Promise(resolve => setTimeout(resolve, 10));

    const link = document.getElementById('optionsLink') as HTMLAnchorElement;
    link.click();

    expect(mockOpenOptionsPage).toHaveBeenCalled();
  });
});

describe('Popup - Initialization: loads cached remainingUses', () => {
  beforeEach(() => {
    setupDOM();
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('displays cached remainingUses from chrome.storage.local on init', async () => {
    mockStorageGet.mockResolvedValue({ remainingUses: 77 });
    await import('../popup');
    fireDOMContentLoaded();
    await new Promise(resolve => setTimeout(resolve, 50));

    const remainingEl = document.getElementById('remainingUses')!;
    expect(remainingEl.textContent).toBe('剩余使用次数：77');
  });

  test('does not set remainingUses text when storage is empty', async () => {
    mockStorageGet.mockResolvedValue({});
    await import('../popup');
    fireDOMContentLoaded();
    await new Promise(resolve => setTimeout(resolve, 50));

    const remainingEl = document.getElementById('remainingUses')!;
    expect(remainingEl.textContent).toBe('');
  });

  test('handles storage.local.get error silently on init', async () => {
    mockStorageGet.mockRejectedValue(new Error('Storage unavailable'));
    await import('../popup');
    // Should not throw
    expect(() => fireDOMContentLoaded()).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 50));
  });
});
