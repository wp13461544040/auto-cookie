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

// ── Core switch logic (uses background service worker to bypass mixed content restrictions) ───

async function doSwitchAccount(): Promise<MessageResponse> {
  const storage = await chrome.storage.local.get(['activationCode', 'apiEndpoint']) as {
    activationCode?: string;
    apiEndpoint?: string;
  };

  if (!storage.activationCode) {
    return { success: false, error: '请先在选项页面配置激活码' };
  }

  if (!storage.apiEndpoint) {
    return { success: false, error: '请先在选项页面配置 API 地址' };
  }

  // Send message to background service worker to handle the API call
  // This avoids mixed content issues (HTTPS page calling HTTP API)
  try {
    console.log('[doSwitchAccount] Sending message to background...');
    const response = await chrome.runtime.sendMessage({
      action: 'switchAccount',
    }) as MessageResponse;

    console.log('[doSwitchAccount] Response from background:', response);

    if (response.success) {
      // Refresh current active tab
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id !== undefined) {
          await chrome.tabs.reload(activeTab.id).catch(() => {/* ignore */});
        }
      } catch { /* ignore */ }
    }

    return response;
  } catch (err: unknown) {
    console.error('[doSwitchAccount] Error:', err);
    const msg = err instanceof Error ? err.message : '发生未知错误';
    return { success: false, error: `错误：${msg}` };
  }
}

// ── Event handlers ─────────────────────────────────────────────────────────

/**
 * Handle local login with direct cookie input (supports JSON format with multiple cookies)
 */
async function handleLocalLogin(): Promise<void> {
  const input = getEl<HTMLTextAreaElement>('localSessionKey');
  let rawInput = input.value.trim();

  if (!rawInput) {
    updateStatus('error', '请输入 Cookie 数据');
    return;
  }

  updateStatus('loading', '登录中，请稍候…');

  try {
    // Parse input as JSON object containing multiple cookies
    let cookiesData: Record<string, string>;
    try {
      cookiesData = JSON.parse(rawInput) as Record<string, string>;
    } catch {
      updateStatus('error', 'JSON 格式不正确，请检查输入');
      return;
    }

    // Validate that we have at least sessionKey
    if (!cookiesData.sessionKey) {
      updateStatus('error', '缺少必需的 sessionKey');
      return;
    }

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

    // Set all cookies from the input JSON
    let successCount = 0;
    for (const [name, value] of Object.entries(cookiesData)) {
      if (!value || typeof value !== 'string') continue;

      const setOpts: chrome.cookies.SetDetails = {
        url: 'https://claude.ai',
        name: name,
        value: value,
        domain: '.claude.ai',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax' as chrome.cookies.SameSiteStatus,
        expirationDate: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      };
      if (storeId) setOpts.storeId = storeId;
      
      const result = await chrome.cookies.set(setOpts);
      if (result) successCount++;
    }

    if (successCount === 0) {
      updateStatus('error', 'Cookie 设置失败');
      return;
    }

    // Refresh current active tab
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id !== undefined) {
        await chrome.tabs.reload(activeTab.id).catch(() => {/* ignore */});
      }
    } catch { /* ignore */ }

    updateStatus('success', `本地登录成功！已设置 ${successCount} 个 Cookie`);
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
    updateStatus('idle', '请输入 JSON 格式的 Cookies 进行本地登录');
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
    console.log('[handleSwitchAccount] Starting account switch...');
    const response = await doSwitchAccount();
    console.log('[handleSwitchAccount] Switch result:', response);

    if (response.success) {
      updateStatus('success', '账号切换成功！', response.remainingUses);
    } else {
      const errorMsg = mapErrorMessage(response.error, response.reason);
      console.log('[handleSwitchAccount] Displaying error:', errorMsg);
      updateStatus('error', errorMsg);
    }
  } catch (err: unknown) {
    console.error('[handleSwitchAccount] Caught error:', err);
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
    case 'expired':       
      // 检查错误信息判断是激活码过期还是 sessionKey 失效
      if (error && error.includes('SessionKey')) {
        return error; // 直接返回详细的错误信息
      }
      return '激活码已过期，请联系管理员';
    case 'no_uses_left':
      // 检查是库存不足还是激活码次数耗尽
      if (error && error.includes('库存')) {
        return '❌ 当前没有可用的账号库存\n\n可能原因：\n· 所有账号都已被使用\n· 等待账号自动解绑（8小时后）\n\n请稍后重试或联系管理员';
      }
      return '激活码使用次数已耗尽';
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
  getEl<HTMLTextAreaElement>('localSessionKey').addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      void handleLocalLogin();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => { void initialize(); });
