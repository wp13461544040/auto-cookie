/**
 * Content Script Helper for SessionKey Verification
 * 
 * 在页面上下文中执行验证请求，可以自然访问该页面的 cookies
 */

// 监听来自 background script 的验证请求
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'verifySessionKey') {
    console.log('[verify-helper] Received verification request');
    
    // 异步执行验证
    verifySessionKeyInPage()
      .then(result => {
        console.log('[verify-helper] Verification result:', result);
        sendResponse(result);
      })
      .catch(err => {
        console.error('[verify-helper] Verification error:', err);
        sendResponse({ success: false, error: err.message });
      });
    
    // 返回 true 表示异步响应
    return true;
  }
  
  return false; // 其他消息不处理
});

async function verifySessionKeyInPage(): Promise<{ success: boolean; status?: number; contentType?: string; error?: string }> {
  try {
    console.log('[verify-helper] Calling Claude API from page context...');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    try {
      const response = await fetch('https://claude.ai/api/account?statsig_hashing_algorithm=djb2', {
        method: 'GET',
        headers: {
          'accept': '*/*',
          'accept-language': 'en-US,en;q=0.9',
          'anthropic-client-platform': 'web_claude_ai',
          'anthropic-client-version': '1.0.0',
        },
        credentials: 'include', // 页面上下文中会自动发送 cookies
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      const contentType = response.headers.get('content-type') || '';
      
      console.log('[verify-helper] Response:', response.status, contentType);
      
      return {
        success: response.status === 200 && contentType.includes('application/json'),
        status: response.status,
        contentType,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[verify-helper] Error:', message);
    return {
      success: false,
      error: message,
    };
  }
}

console.log('[verify-helper] Content script loaded');
