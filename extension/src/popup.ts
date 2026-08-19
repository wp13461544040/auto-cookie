/**
 * Popup UI Controller for Claude Account Switcher
 * Handles user interactions and communicates with the background service worker.
 */

// ── Types ──────────────────────────────────────────────────────────────────

interface MessageResponse {
  success: boolean;
  error?: string;
  reason?: string;
  remainingUses?: number;
}

type StatusType = 'idle' | 'loading' | 'success' | 'error';

// ── DOM references ─────────────────────────────────────────────────────────

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

// ── Status helpers ─────────────────────────────────────────────────────────

/**
 * Update the status display area.
 * (7.7) loading: button disabled + spinner
 * (7.8) success: green message + remaining uses
 * (7.9) error:   red message + error text
 */
export function updateStatus(type: StatusType, message: string, remainingUses?: number): void {
  const statusDiv    = getEl<HTMLDivElement>('status');
  const statusMsg    = getEl<HTMLParagraphElement>('statusMessage');
  const remainingEl  = getEl<HTMLParagraphElement>('remainingUses');
  const spinner      = getEl<HTMLSpanElement>('spinner');
  const switchButton = getEl<HTMLButtonElement>('switchButton');

  // Clear previous type classes
  statusDiv.className = `status status-${type}`;

  statusMsg.textContent = message;

  // Show/hide spinner (7.7)
  if (type === 'loading') {
    spinner.hidden = false;
    switchButton.disabled = true;
  } else {
    spinner.hidden = true;
    switchButton.disabled = false;
  }

  // Show remaining uses on success (7.8)
  if (remainingUses !== undefined && remainingUses !== null) {
    remainingEl.textContent = `剩余使用次数：${remainingUses}`;
  } else if (type !== 'success') {
    // Keep existing remaining uses text if available
  }
}

// ── Core switch logic (runs directly in popup, no Service Worker dependency) ───

async function doSwitchAccount(): Promise<MessageResponse> {
  const storage = await chrome.storage.local.get(['activationCode', 'apiEndpoint']) as {
    activationCode?: string;
    apiEndpoint?: string;
  };

  if (!storage.activationCode) {
    return { success: false, error: '请先在选项页面配置激活码' };
  }

  const apiEndpoint = storage.apiEndpoint || 'https://api.example.com';

  // Call backend API
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  let response: Response;
  try {
    response = await fetch(`${apiEndpoint}/api/session-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activationCode: storage.activationCode }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let errData: { error?: string; reason?: string } = {};
    try { errData = await response.json(); } catch { /* ignore */ }
    return { success: false, error: errData.error ?? `HTTP ${response.status}`, reason: errData.reason };
  }

  const data = await response.json() as { sessionKey: string; remainingUses: number };

  // Get current window's cookie store ID (handles incognito mode)
  let storeId: string | undefined;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.incognito) {
      // In incognito mode, find the incognito cookie store
      const stores = await chrome.cookies.getAllCookieStores();
      const incognitoStore = stores.find(s => s.tabIds.includes(activeTab.id!));
      storeId = incognitoStore?.id;
    }
  } catch { /* ignore, use default store */ }

  // Clear ALL existing claude.ai cookies (both domain variants)
  try {
    const getAllOpts = storeId ? { domain: 'claude.ai', storeId } : { domain: 'claude.ai' };
    const getAllOpts2 = storeId ? { domain: '.claude.ai', storeId } : { domain: '.claude.ai' };
    const [cookies1, cookies2] = await Promise.all([
      chrome.cookies.getAll(getAllOpts),
      chrome.cookies.getAll(getAllOpts2),
    ]);
    const allCookies = [...cookies1, ...cookies2];
    // Deduplicate by name+domain+path
    const seen = new Set<string>();
    for (const c of allCookies) {
      const key = `${c.name}|${c.domain}|${c.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Try multiple URL variants to ensure removal
      const baseDomain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
      const urls = [
        `https://${baseDomain}${c.path}`,
        `https://www.${baseDomain}${c.path}`,
        `https://claude.ai${c.path}`,
      ];
      for (const url of urls) {
        const removeOpts = storeId ? { url, name: c.name, storeId } : { url, name: c.name };
        await chrome.cookies.remove(removeOpts).catch(() => {/* ignore */});
      }
    }
  } catch { /* ignore */ }

  // Set new sessionKey cookie
  // domain must be '.claude.ai' (with leading dot) so all subdomains can read it
  const setOpts: chrome.cookies.SetDetails = {
    url: 'https://claude.ai',
    name: 'sessionKey',
    value: data.sessionKey,
    domain: '.claude.ai',
    path: '/',
    secure: true,
    httpOnly: false,
    sameSite: 'lax' as chrome.cookies.SameSiteStatus,
    expirationDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
  if (storeId) setOpts.storeId = storeId;
  const result = await chrome.cookies.set(setOpts);

  if (!result) {
    return { success: false, error: 'cookie 设置失败' };
  }

  // Refresh current active tab
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id !== undefined) {
      await chrome.tabs.reload(activeTab.id).catch(() => {/* ignore */});
    }
  } catch { /* ignore */ }

  // Cache to storage
  await chrome.storage.local.set({ lastSwitchTime: new Date().toISOString(), remainingUses: data.remainingUses });

  return { success: true, remainingUses: data.remainingUses };
}

// ── Event handlers ─────────────────────────────────────────────────────────

/**
 * Handle local login with direct sessionKey input
 */
async function handleLocalLogin(): Promise<void> {
  const input = getEl<HTMLInputElement>('localSessionKey');
  let rawKey = input.value.trim();

  if (!rawKey) {
    updateStatus('error', '请输入 sessionKey');
    return;
  }

  // Clean sessionKey format: remove "sessionKey=" prefix if present
  if (rawKey.includes('=')) {
    rawKey = rawKey.split('=').slice(1).join('=');
  }

  if (rawKey.length < 20) {
    updateStatus('error', 'sessionKey 格式不正确');
    return;
  }

  updateStatus('loading', '登录中，请稍候…');

  try {
    // Get current window's cookie store ID (handles incognito mode)
    let storeId: string | undefined;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.incognito) {
        const stores = await chrome.cookies.getAllCookieStores();
        const incognitoStore = stores.find(s => s.tabIds.includes(activeTab.id!));
        storeId = incognitoStore?.id;
      }
    } catch { /* ignore */ }

    // Clear ALL existing claude.ai cookies
    try {
      const getAllOpts = storeId ? { domain: 'claude.ai', storeId } : { domain: 'claude.ai' };
      const getAllOpts2 = storeId ? { domain: '.claude.ai', storeId } : { domain: '.claude.ai' };
      const [cookies1, cookies2] = await Promise.all([
        chrome.cookies.getAll(getAllOpts),
        chrome.cookies.getAll(getAllOpts2),
      ]);
      const allCookies = [...cookies1, ...cookies2];
      const seen = new Set<string>();
      for (const c of allCookies) {
        const key = `${c.name}|${c.domain}|${c.path}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const baseDomain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
        const urls = [
          `https://${baseDomain}${c.path}`,
          `https://www.${baseDomain}${c.path}`,
          `https://claude.ai${c.path}`,
        ];
        for (const url of urls) {
          const removeOpts = storeId ? { url, name: c.name, storeId } : { url, name: c.name };
          await chrome.cookies.remove(removeOpts).catch(() => {/* ignore */});
        }
      }
    } catch { /* ignore */ }

    // Set new sessionKey cookie
    const setOpts: chrome.cookies.SetDetails = {
      url: 'https://claude.ai',
      name: 'sessionKey',
      value: rawKey,
      domain: '.claude.ai',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'lax' as chrome.cookies.SameSiteStatus,
      expirationDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    };
    if (storeId) setOpts.storeId = storeId;
    const result = await chrome.cookies.set(setOpts);

    if (!result) {
      updateStatus('error', 'cookie 设置失败');
      return;
    }

    // Refresh current active tab
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id !== undefined) {
        await chrome.tabs.reload(activeTab.id).catch(() => {/* ignore */});
      }
    } catch { /* ignore */ }

    updateStatus('success', '本地登录成功！');
    input.value = ''; // Clear input
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '发生未知错误';
    updateStatus('error', `错误：${msg}`);
  }
}

/**
 * Handle mode switch between activation code and local login
 */
function handleModeSwitch(): void {
  const modeLocal = getEl<HTMLInputElement>('modeLocal');
  const switchButton = getEl<HTMLButtonElement>('switchButton');
  const localLoginForm = getEl<HTMLDivElement>('localLoginForm');
  const remainingEl = getEl<HTMLParagraphElement>('remainingUses');

  if (modeLocal.checked) {
    // Switch to local login mode
    switchButton.hidden = true;
    localLoginForm.hidden = false;
    remainingEl.textContent = ''; // Hide remaining uses
    updateStatus('idle', '请输入 sessionKey 进行本地登录');
  } else {
    // Switch to activation code mode
    switchButton.hidden = false;
    localLoginForm.hidden = true;
    updateStatus('idle', '准备切换账号');
    void loadCachedStatus(); // Reload remaining uses
  }
}

/**
 * Handle "Switch Account" button click. (7.5)
 */
async function handleSwitchAccount(): Promise<void> {
  if (!confirm('请确认是否切换，切换后会消耗一次额度，且无法返回')) {
    return;
  }
  updateStatus('loading', '切换中，请稍候…');

  try {
    const response = await doSwitchAccount();

    if (response.success) {
      updateStatus('success', '账号切换成功！', response.remainingUses);
    } else {
      const errorMsg = mapErrorMessage(response.error, response.reason);
      updateStatus('error', errorMsg);
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      updateStatus('error', '请求超时，请检查网络连接');
    } else {
      const msg = err instanceof Error ? err.message : '发生未知错误';
      updateStatus('error', `错误：${msg}`);
    }
  }
}

/**
 * Map API error reasons to user-friendly messages.
 */
export function mapErrorMessage(error?: string, reason?: string): string {
  switch (reason) {
    case 'invalid_code':  return '无效的激活码，请检查配置';
    case 'expired':       return '激活码已过期，请联系管理员';
    case 'no_uses_left':  return '激活码使用次数已耗尽';
    case 'disabled':      return '激活码已被禁用';
    default:              return error ?? '切换失败，请重试';
  }
}

/**
 * Open the options page. (7.10)
 */
function openOptions(event: Event): void {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
}

// ── Initialization ─────────────────────────────────────────────────────────

/**
 * Load cached remaining uses from storage on popup open.
 */
async function loadCachedStatus(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(['remainingUses', 'lastSwitchTime']) as {
      remainingUses?: number;
      lastSwitchTime?: string;
    };

    if (data.remainingUses !== undefined) {
      const remainingEl = getEl<HTMLParagraphElement>('remainingUses');
      remainingEl.textContent = `剩余使用次数：${data.remainingUses}`;
    }
  } catch {
    // Silently ignore storage errors on init
  }
}

/**
 * Initialize popup on DOM ready.
 */
async function initialize(): Promise<void> {
  await loadCachedStatus();

  // Attach event listeners
  getEl<HTMLButtonElement>('switchButton').addEventListener('click', () => {
    void handleSwitchAccount();
  });

  getEl<HTMLButtonElement>('localLoginButton').addEventListener('click', () => {
    void handleLocalLogin();
  });

  getEl<HTMLAnchorElement>('optionsLink').addEventListener('click', openOptions);

  // Mode switch handlers
  getEl<HTMLInputElement>('modeActivation').addEventListener('change', handleModeSwitch);
  getEl<HTMLInputElement>('modeLocal').addEventListener('change', handleModeSwitch);

  // Enter key support for local login
  getEl<HTMLInputElement>('localSessionKey').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      void handleLocalLogin();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => { void initialize(); });
