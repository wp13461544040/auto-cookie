// Background Service Worker
// Handles account switching logic, cookie operations, and API communication

const API_ENDPOINT = 'https://api.example.com'; // TODO: Configure actual API endpoint

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'switchAccount') {
    handleSwitchAccount()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        success: false,
        error: error.message
      }));
    return true; // Keep message channel open for async response
  }
});

/**
 * Main account switching handler
 */
async function handleSwitchAccount() {
  try {
    // Step 1: Get activation code from storage
    const { activationCode } = await chrome.storage.local.get('activationCode');
    
    if (!activationCode) {
      return {
        success: false,
        error: 'Please configure activation code in options'
      };
    }
    
    // Step 2: Execute account switch
    return await switchAccount(activationCode);
  } catch (error) {
    console.error('Error in handleSwitchAccount:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

/**
 * Main account switching logic
 */
async function switchAccount(activationCode) {
  try {
    // Step 1: Get sessionKey from API
    // Read apiEndpoint from storage, fallback to hardcoded value
    const storageData = await chrome.storage.local.get('apiEndpoint');
    const apiEndpoint = storageData.apiEndpoint || API_ENDPOINT;

    const apiResponse = await fetch(`${apiEndpoint}/api/session-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ activationCode })
    });
    
    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      return {
        success: false,
        error: errorData.error || 'API request failed',
        reason: errorData.reason
      };
    }
    
    const { sessionKey, remainingUses } = await apiResponse.json();
    
    // Step 2: Clear all claude.ai cookies
    await clearClaudeCookies();
    
    // Step 3: Set new sessionKey cookie
    await setSessionKeyCookie(sessionKey);
    
    // Step 4: Refresh all claude.ai tabs (已注释：暂时禁用自动刷新)
    // await refreshClaudeTabs();
    
    // Step 5: Update local cache
    await chrome.storage.local.set({
      lastSwitchTime: new Date().toISOString(),
      remainingUses: remainingUses
    });
    
    return {
      success: true,
      sessionKey: sessionKey,
      remainingUses: remainingUses
    };
  } catch (error) {
    console.error('Error in switchAccount:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

/**
 * Clear all cookies for claude.ai domain
 */
async function clearClaudeCookies() {
  const cookies = await chrome.cookies.getAll({
    domain: 'claude.ai'
  });
  
  for (const cookie of cookies) {
    const url = `https://${cookie.domain.startsWith('.') ? 'www' : ''}${cookie.domain}${cookie.path}`;
    
    await chrome.cookies.remove({
      url: url,
      name: cookie.name
    });
  }
}

/**
 * Set sessionKey cookie for claude.ai
 */
async function setSessionKeyCookie(sessionKey) {
  const cookieDetails = {
    url: 'https://claude.ai',
    name: 'sessionKey',
    value: sessionKey,
    domain: '.claude.ai',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'lax',
    expirationDate: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
  };
  
  await chrome.cookies.set(cookieDetails);
}

/**
 * Refresh all open claude.ai tabs
 */
async function refreshClaudeTabs() {
  const tabs = await chrome.tabs.query({
    url: 'https://claude.ai/*'
  });
  
  for (const tab of tabs) {
    if (tab.id) {
      await chrome.tabs.reload(tab.id);
    }
  }
}
