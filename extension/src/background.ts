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

    // 获取当前标签页的 storeId (用于无痕模式支持)
    let currentStoreId: string | undefined;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length > 0 && tabs[0].id) {
        const stores = await chrome.cookies.getAllCookieStores();
        const tabStore = stores.find(store => store.tabIds.includes(tabs[0].id!));
        if (tabStore) {
          currentStoreId = tabStore.id;
          console.log('[doSwitchAccount] Current store ID:', currentStoreId);
        }
      }
    } catch (err) {
      console.warn('[doSwitchAccount] Could not determine store ID:', err);
    }

    // Step 1: Clear existing claude.ai cookies
    await clearClaudeCookies(currentStoreId);

    // Step 2: Set all cookies from response
    await setAllCookies(cookies, currentStoreId);

    // 等待 Cookie 设置完成（无痕模式需要更长时间）
    const waitTime = currentStoreId && currentStoreId !== '0' ? 2000 : 1000;
    console.log(`[switchAccount] Waiting ${waitTime}ms for cookies to take effect...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));

    // Step 3: Verify sessionKey by calling Claude API (with retry)
    let isValid = false;
    const maxRetries = 3; // 增加到3次
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`[switchAccount] Verification attempt ${attempt}/${maxRetries} (store: ${currentStoreId || 'default'})`);
      
      // 验证前再次确认 cookie 已设置
      const checkCookie = await chrome.cookies.get({
        url: 'https://claude.ai',
        name: 'sessionKey',
        storeId: currentStoreId,
      });
      
      if (checkCookie) {
        console.log(`[switchAccount] sessionKey cookie found: ${checkCookie.value.substring(0, 20)}...`);
      } else {
        console.error('[switchAccount] sessionKey cookie NOT found before verification!');
      }
      
      isValid = await verifySessionKey(sessionKey, currentStoreId);
      
      if (isValid) {
        console.log(`[switchAccount] ✓ Verification succeeded on attempt ${attempt}`);
        break;
      }
      
      // 如果失败，等待后重试（无痕模式下 cookie 未立即生效）
      if (attempt < maxRetries) {
        const retryWait = 2000 * attempt; // 递增等待时间
        console.log(`[switchAccount] Verification failed, waiting ${retryWait}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryWait));
      }
    }
    
    if (!isValid) {
      // SessionKey 验证失败，回滚激活码使用次数
      try {
        await fetch(`${apiEndpoint}/api/session-key/rollback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activationCode: activationCode }),
        }).catch(() => {/* ignore rollback errors */});
      } catch {/* ignore */}

      // 报告后端标记此 key 为失效
      try {
        await fetch(`${apiEndpoint}/api/session-key/report-invalid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionKey }),
        }).catch(() => {/* ignore report errors */});
      } catch {/* ignore */}
      
      return {
        success: false,
        error: 'SessionKey 验证失败，此账号已失效（不扣除使用次数），请重试获取新账号',
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

async function clearClaudeCookies(storeId?: string): Promise<void> {
  console.log('[clearClaudeCookies] Clearing cookies, storeId:', storeId);
  
  // 如果指定了 storeId, 只清除该 store 的 cookies
  // 否则清除所有 stores 的 cookies
  const targetStoreIds: string[] = [];
  
  if (storeId) {
    targetStoreIds.push(storeId);
  } else {
    try {
      const stores = await chrome.cookies.getAllCookieStores();
      targetStoreIds.push(...stores.map(s => s.id));
    } catch (err) {
      console.warn('[clearClaudeCookies] Could not get stores:', err);
      // 如果获取失败，尝试不指定 storeId
      targetStoreIds.push('');
    }
  }
  
  for (const targetStore of targetStoreIds) {
    try {
      // 获取该 store 中的所有 claude.ai cookies
      const getOptions: chrome.cookies.GetAllDetails = { 
        domain: 'claude.ai',
      };
      if (targetStore) {
        getOptions.storeId = targetStore;
      }
      
      const [cookies1, cookies2] = await Promise.all([
        chrome.cookies.getAll(getOptions),
        chrome.cookies.getAll({ ...getOptions, domain: '.claude.ai' }),
      ]);
      
      // 去重
      const seen = new Set<string>();
      const cookies = [...cookies1, ...cookies2].filter(c => {
        const key = `${c.name}|${c.domain}|${c.path}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      
      console.log(`[clearClaudeCookies] Found ${cookies.length} cookies in store ${targetStore || 'default'}`);
      
      // 删除每个 cookie
      for (const cookie of cookies) {
        try {
          const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          const url = `https://${domain}${cookie.path}`;
          
          const removeOptions: chrome.cookies.Details = {
            url,
            name: cookie.name,
          };
          if (targetStore) {
            removeOptions.storeId = targetStore;
          }
          
          await chrome.cookies.remove(removeOptions);
          console.log(`[clearClaudeCookies] Removed: ${cookie.name} from store ${targetStore || 'default'}`);
        } catch (err: unknown) {
          console.error(`[clearClaudeCookies] Remove failed for ${cookie.name}:`, err);
        }
      }
    } catch (err: unknown) {
      console.error(`[clearClaudeCookies] Failed for store ${targetStore}:`, err);
    }
  }
}

// ─── Set All Cookies ──────────────────────────────────────────────────────────

async function setAllCookies(
  cookies: {
    __cf_bm?: string;
    _cfuvid?: string;
    sessionKey: string;
    sessionKeyLC: string;
    routingHint?: string;
    'ion-vk'?: string;
  },
  storeId?: string
): Promise<void> {
  console.log('[setAllCookies] Received cookies:', cookies);
  console.log('[setAllCookies] Target storeId:', storeId);

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

  console.log('[setAllCookies] Cookies to set:', cookiesToSet.map(c => c.name));

  // 如果指定了 storeId, 只在该 store 中设置
  // 否则在所有 stores 中设置
  const targetStoreIds: string[] = [];
  
  if (storeId) {
    targetStoreIds.push(storeId);
  } else {
    try {
      const stores = await chrome.cookies.getAllCookieStores();
      targetStoreIds.push(...stores.map(s => s.id));
      console.log('[setAllCookies] Available stores:', stores.map(s => s.id));
    } catch (err) {
      console.warn('[setAllCookies] Could not get stores:', err);
      targetStoreIds.push('0'); // 默认 store
    }
  }

  for (const targetStore of targetStoreIds) {
    console.log(`[setAllCookies] Setting cookies in store: ${targetStore}`);
    
    for (const cookie of cookiesToSet) {
      try {
        const cookieDetails: chrome.cookies.SetDetails = {
          url: 'https://claude.ai',
          name: cookie.name,
          value: cookie.value,
          domain: '.claude.ai',
          path: '/',
          secure: true,
          httpOnly: false,
          sameSite: 'no_restriction' as chrome.cookies.SameSiteStatus,
          expirationDate: Math.floor(Date.now() / 1000) + COOKIE_EXPIRY_SECONDS,
          storeId: targetStore,
        };
        
        const result = await chrome.cookies.set(cookieDetails);
        
        if (!result) {
          console.error(`[setAllCookies] ✗ Failed: ${cookie.name} in store ${targetStore}`);
        } else {
          console.log(`[setAllCookies] ✓ Set: ${cookie.name} in store ${targetStore}`);
          
          // 验证 Cookie
          const verification = await chrome.cookies.get({
            url: 'https://claude.ai',
            name: cookie.name,
            storeId: targetStore,
          });
          
          if (verification && verification.value === cookie.value) {
            console.log(`[setAllCookies] ✓ Verified: ${cookie.name}`);
          } else {
            console.error(`[setAllCookies] ✗ Verify failed: ${cookie.name}`, verification);
          }
        }
      } catch (err: unknown) {
        console.error(`[setAllCookies] Error setting ${cookie.name} in store ${targetStore}:`, err);
        if (err instanceof Error) {
          console.error(`[setAllCookies] Details:`, err.message);
        }
      }
    }
  }
  
  console.log('[setAllCookies] Completed');
}

// ─── Verify SessionKey (client-side validation) ──────────────────────────────

async function verifySessionKey(sessionKey: string, storeId?: string): Promise<boolean> {
  try {
    console.log('[verifySessionKey] Starting verification...');
    console.log('[verifySessionKey] Expected sessionKey:', sessionKey.substring(0, 30) + '...');
    console.log('[verifySessionKey] Target storeId:', storeId || 'default');
    
    // 获取指定 store 中所有 claude.ai 的 cookies
    const getOptions: chrome.cookies.GetAllDetails = {
      url: 'https://claude.ai',
    };
    if (storeId) {
      getOptions.storeId = storeId;
    }
    
    const allCookies = await chrome.cookies.getAll(getOptions);
    
    console.log('[verifySessionKey] Found cookies in store', storeId || 'default', ':', allCookies.map(c => `${c.name}=${c.value.substring(0, 10)}...`));
    
    if (allCookies.length === 0) {
      console.error('[verifySessionKey] No cookies found! Store:', storeId);
      return false;
    }
    
    // ⚠️ 关键检查：必须包含 sessionKey cookie
    const sessionKeyCookie = allCookies.find(c => c.name === 'sessionKey');
    
    if (!sessionKeyCookie) {
      console.error('[verifySessionKey] sessionKey cookie not found in cookies');
      return false;
    }
    
    console.log('[verifySessionKey] sessionKey cookie value:', sessionKeyCookie.value.substring(0, 30) + '...');
    
    if (!sessionKeyCookie.value || !sessionKeyCookie.value.startsWith('sk-ant-')) {
      console.error('[verifySessionKey] sessionKey cookie value invalid or wrong format');
      return false;
    }
    
    // 验证 sessionKey 值是否匹配（去除可能的 "sessionKey=" 前缀）
    const cleanSessionKey = sessionKey.replace('sessionKey=', '');
    const cleanCookieValue = sessionKeyCookie.value.replace('sessionKey=', '');
    
    if (cleanCookieValue !== cleanSessionKey) {
      console.error('[verifySessionKey] sessionKey mismatch!');
      console.error('[verifySessionKey] Expected:', cleanSessionKey.substring(0, 30) + '...');
      console.error('[verifySessionKey] Got:', cleanCookieValue.substring(0, 30) + '...');
      return false;
    }
    
    console.log('[verifySessionKey] ✓ sessionKey cookie validated');
    
    // 构建完整的 cookie 字符串
    const cookieString = allCookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ');
    
    console.log('[verifySessionKey] Cookie count:', allCookies.length);
    console.log('[verifySessionKey] Cookie string length:', cookieString.length);
    console.log('[verifySessionKey] Calling Claude API for verification...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      // 使用 XMLHttpRequest 来确保 cookies 被正确发送
      response = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', 'https://claude.ai/api/account?statsig_hashing_algorithm=djb2', true);
        
        // 设置必要的 headers
        xhr.setRequestHeader('accept', '*/*');
        xhr.setRequestHeader('accept-language', 'en-US,en;q=0.9');
        xhr.setRequestHeader('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
        xhr.setRequestHeader('anthropic-client-platform', 'web_claude_ai');
        xhr.setRequestHeader('anthropic-client-version', '1.0.0');
        
        // 手动设置 Cookie header
        xhr.setRequestHeader('Cookie', cookieString);
        
        xhr.withCredentials = true; // 允许发送 cookies
        
        xhr.onload = () => {
          const headers = new Headers();
          const contentType = xhr.getResponseHeader('content-type') || '';
          headers.set('content-type', contentType);
          
          resolve(new Response(xhr.responseText, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers: headers,
          }));
        };
        
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.ontimeout = () => reject(new Error('Request timeout'));
        
        xhr.timeout = 15000;
        xhr.send();
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const contentType = response.headers.get('content-type') || '';

    console.log('[verifySessionKey] Response status:', response.status, 'Content-Type:', contentType);

    // Valid: 200 + JSON response
    if (response.status === 200 && contentType.includes('application/json')) {
      console.log('[verifySessionKey] ✓ SessionKey 验证通过');
      return true;
    }

    // Invalid: redirected to login (HTML) or 401/403
    console.warn('[verifySessionKey] ✗ SessionKey 验证失败:', response.status, contentType);
    
    // 如果是重定向或 HTML 响应，说明 session 已失效
    if (contentType.includes('text/html')) {
      console.warn('[verifySessionKey] Got HTML response, session likely expired');
    }
    
    return false;
  } catch (err: unknown) {
    console.error('[verifySessionKey] Error:', err);
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
