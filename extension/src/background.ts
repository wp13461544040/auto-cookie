/**
 * Background Service Worker for Claude Account Switcher
 * Handles cookie operations, API calls, and tab management
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  action: 'switchAccount' | 'getStatus';
  payload?: unknown;
}

interface MessageResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  reason?: string;
  remainingUses?: number;
}

interface SwitchResult {
  success: boolean;
  sessionKey?: string;
  remainingUses?: number;
  error?: string;
  reason?: string;
}

interface ApiSuccessResponse {
  sessionKey: string;
  remainingUses: number;
  cookies: {
    __cf_bm?: string;
    _cfuvid?: string;
    sessionKey: string;
    sessionKeyLC: string;
    routingHint?: string;
    'ion-vk'?: string;
  };
  metadata?: {
    email?: string;
    uuid?: string;
    anonymousId?: string;
    deviceId?: string;
  };
}

interface ApiErrorResponse {
  error?: string;
  reason?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_API_ENDPOINT = 'https://api.example.com';
const REQUEST_TIMEOUT_MS = 30_000; // 30 seconds
const COOKIE_EXPIRY_SECONDS = 30 * 24 * 60 * 60; // 30 days

// ─── Message Listener (6.2) ───────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): boolean => {
    handleMessage(message as Message)
      .then(sendResponse)
      .catch((err: unknown) => {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        sendResponse({ success: false, error: errorMsg });
      });
    // Return true to keep message channel open for async response
    return true;
  }
);

// ─── Message Router (6.3) ─────────────────────────────────────────────────────

async function handleMessage(message: Message): Promise<MessageResponse> {
  if (message.action === 'switchAccount') {
    try {
      // Read activation code from storage
      const storageResult = await chrome.storage.local.get('activationCode');
      const activationCode = storageResult['activationCode'] as string | undefined;

      if (!activationCode) {
        return {
          success: false,
          error: '请先在选项页面配置激活码',
        };
      }

      const result = await switchAccount(activationCode);
      return {
        success: result.success,
        error: result.error,
        reason: result.reason,
        remainingUses: result.remainingUses,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error: errorMsg };
    }
  }

  if (message.action === 'getStatus') {
    try {
      const data = await chrome.storage.local.get(['lastSwitchTime', 'remainingUses']);
      return { success: true, data };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : '获取状态失败';
      return { success: false, error: errorMsg };
    }
  }

  return { success: false, error: '未知操作' };
}

// ─── Main Switch Function (6.4 & 6.5) ────────────────────────────────────────

async function switchAccount(activationCode: string): Promise<SwitchResult> {
  try {
    // Read API endpoint from storage (6.4) — allows user configuration
    const storageResult = await chrome.storage.local.get('apiEndpoint');
    const apiEndpoint =
      (storageResult['apiEndpoint'] as string | undefined) ?? DEFAULT_API_ENDPOINT;

    // Call backend API with timeout (6.5)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${apiEndpoint}/api/session-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activationCode }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle HTTP error responses (6.6)
    if (!response.ok) {
      let errorData: ApiErrorResponse = {};
      try {
        errorData = (await response.json()) as ApiErrorResponse;
      } catch {
        // ignore JSON parse errors on error responses
      }
      return {
        success: false,
        error: errorData.error ?? `HTTP ${response.status}`,
        reason: errorData.reason,
      };
    }

    const responseData = (await response.json()) as ApiSuccessResponse;
    const { sessionKey, remainingUses, cookies } = responseData;

    // Step 1: Clear existing claude.ai cookies
    await clearClaudeCookies();

    // Step 2: Set all cookies from response
    await setAllCookies(cookies);

    // Step 3: Verify sessionKey by calling Claude API
    const isValid = await verifySessionKey(sessionKey);
    
    if (!isValid) {
      // Report to backend that this key is invalid
      try {
        await fetch(`${apiEndpoint}/api/session-key/report-invalid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionKey }),
        }).catch(() => {/* ignore report errors */});
      } catch {/* ignore */}
      
      return {
        success: false,
        error: 'SessionKey 验证失败，此账号已失效，请重试',
        reason: 'expired',
      };
    }

    // Step 4: Update storage cache (6.15)
    await chrome.storage.local.set({
      lastSwitchTime: new Date().toISOString(),
      remainingUses,
    });

    return {
      success: true,
      sessionKey,
      remainingUses,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { success: false, error: '请求超时，请检查网络连接' };
    }
    const errorMsg = err instanceof Error ? err.message : '账号切换失败';
    return { success: false, error: errorMsg };
  }
}

// ─── Clear Claude Cookies (6.7 ~ 6.9) ────────────────────────────────────────

async function clearClaudeCookies(): Promise<void> {
  // 6.8 — get all cookies for both claude.ai and .claude.ai domains
  let cookies: chrome.cookies.Cookie[];
  try {
    const [cookies1, cookies2] = await Promise.all([
      chrome.cookies.getAll({ domain: 'claude.ai' }),
      chrome.cookies.getAll({ domain: '.claude.ai' }),
    ]);
    // Deduplicate by name+domain+path
    const seen = new Set<string>();
    cookies = [...cookies1, ...cookies2].filter(c => {
      const key = `${c.name}|${c.domain}|${c.path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (err: unknown) {
    // 6.16 — catch chrome API errors
    console.error('clearClaudeCookies: getAll failed', err);
    return;
  }

  // 6.9 — remove each cookie
  for (const cookie of cookies) {
    try {
      // For cookies with domain like '.claude.ai', we need to try multiple URLs
      const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
      const urls = [
        `https://${domain}${cookie.path}`,
        `https://www.${domain}${cookie.path}`,
        `https://claude.ai${cookie.path}`,
      ];
      for (const url of urls) {
        try {
          await chrome.cookies.remove({ url, name: cookie.name });
        } catch { /* try next url */ }
      }
    } catch (err: unknown) {
      console.error(`clearClaudeCookies: remove failed for ${cookie.name}`, err);
    }
  }
}

// ─── Set All Cookies ──────────────────────────────────────────────────────────

async function setAllCookies(cookies: {
  __cf_bm?: string;
  _cfuvid?: string;
  sessionKey: string;
  sessionKeyLC: string;
  routingHint?: string;
  'ion-vk'?: string;
}): Promise<void> {
  console.log('[setAllCookies] Received cookies:', cookies);

  const cookiesToSet: Array<{ name: string; value: string }> = [];

  // Always set these
  cookiesToSet.push({ name: 'sessionKey', value: cookies.sessionKey });
  cookiesToSet.push({ name: 'sessionKeyLC', value: cookies.sessionKeyLC });

  // Set optional cookies if they exist
  if (cookies.__cf_bm) {
    cookiesToSet.push({ name: '__cf_bm', value: cookies.__cf_bm });
  }
  if (cookies._cfuvid) {
    cookiesToSet.push({ name: '_cfuvid', value: cookies._cfuvid });
  }
  if (cookies.routingHint) {
    cookiesToSet.push({ name: 'routingHint', value: cookies.routingHint });
  }
  if (cookies['ion-vk']) {
    cookiesToSet.push({ name: 'ion-vk', value: cookies['ion-vk'] });
  }

  console.log('[setAllCookies] Cookies to set:', cookiesToSet);

  for (const cookie of cookiesToSet) {
    try {
      const result = await chrome.cookies.set({
        url: 'https://claude.ai',
        name: cookie.name,
        value: cookie.value,
        domain: '.claude.ai',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'lax' as chrome.cookies.SameSiteStatus,
        expirationDate: Math.floor(Date.now() / 1000) + COOKIE_EXPIRY_SECONDS,
      });
      if (!result) {
        console.error(`[setAllCookies] Failed to set cookie: ${cookie.name}`);
      } else {
        console.log(`[setAllCookies] Successfully set cookie: ${cookie.name}`);
      }
    } catch (err: unknown) {
      console.error(`[setAllCookies] Error setting cookie ${cookie.name}:`, err);
    }
  }
}

// ─── Verify SessionKey (client-side validation) ──────────────────────────────

async function verifySessionKey(sessionKey: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds for verification

    let response: Response;
    try {
      response = await fetch('https://claude.ai/api/account?statsig_hashing_algorithm=djb2', {
        method: 'GET',
        headers: {
          'accept': '*/*',
          'accept-language': 'en-US,en;q=0.9',
          'cookie': `sessionKey=${sessionKey}; sessionKeyLC=${Date.now()}`,
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'anthropic-client-platform': 'web_claude_ai',
          'anthropic-client-version': '1.0.0',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = response.headers.get('content-type') || '';

    // Valid: 200 + JSON response
    if (response.status === 200 && contentType.includes('application/json')) {
      return true;
    }

    // Invalid: redirected to login (HTML) or 401/403
    return false;
  } catch (err: unknown) {
    console.error('verifySessionKey error:', err);
    return false;
  }
}

// ─── Refresh Claude Tabs (6.12 ~ 6.14) ───────────────────────────────────────
// 已注释：暂时禁用自动刷新页面功能
/*
async function refreshClaudeTabs(): Promise<void> {
  let tabs: chrome.tabs.Tab[];
  try {
    // 6.13 — query all claude.ai tabs
    tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  } catch (err: unknown) {
    // 6.16 — catch query errors
    console.error('refreshClaudeTabs: query failed', err);
    return;
  }

  // 6.14 — reload each tab; no tabs is fine (requirement 1.5)
  for (const tab of tabs) {
    try {
      if (tab.id !== undefined) {
        await chrome.tabs.reload(tab.id);
      }
    } catch (err: unknown) {
      // 6.16 — catch per-tab errors and continue
      console.error(`refreshClaudeTabs: reload failed for tab ${tab.id ?? 'unknown'}`, err);
    }
  }
}
*/
