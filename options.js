// Options Page Controller
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  const saveButton = document.getElementById('saveButton');
  
  // Load current configuration
  await loadConfiguration();
  
  // Event listeners
  saveButton.addEventListener('click', handleSave);
}

async function loadConfiguration() {
  try {
    const data = await chrome.storage.local.get([
      'activationCode',
      'apiEndpoint',
      'remainingUses',
      'lastSwitchTime'
    ]);
    
    // Populate form fields
    if (data.activationCode) {
      document.getElementById('activationCode').value = data.activationCode;
      document.getElementById('currentCode').textContent = maskActivationCode(data.activationCode);
    }
    
    if (data.apiEndpoint) {
      document.getElementById('apiEndpoint').value = data.apiEndpoint;
    }
    
    // Update status display
    if (data.remainingUses !== undefined) {
      document.getElementById('remainingUses').textContent = data.remainingUses;
    }
    
    if (data.lastSwitchTime) {
      const lastSwitch = new Date(data.lastSwitchTime);
      document.getElementById('lastSwitch').textContent = formatDateTime(lastSwitch);
    }
  } catch (error) {
    console.error('Failed to load configuration:', error);
    showMessage('error', 'Failed to load configuration');
  }
}

async function handleSave() {
  const activationCode = document.getElementById('activationCode').value.trim();
  const apiEndpoint = document.getElementById('apiEndpoint').value.trim();
  
  // Validate activation code
  if (!activationCode) {
    showMessage('error', 'Activation code is required');
    return;
  }
  
  if (!validateActivationCodeFormat(activationCode)) {
    showMessage('error', 'Invalid activation code format (expected 16-32 characters)');
    return;
  }
  
  // Validate API endpoint
  if (!apiEndpoint) {
    showMessage('error', 'API endpoint is required');
    return;
  }
  
  if (!isValidUrl(apiEndpoint)) {
    showMessage('error', 'Invalid API endpoint URL');
    return;
  }
  
  try {
    // Save configuration
    await chrome.storage.local.set({
      activationCode: activationCode,
      apiEndpoint: apiEndpoint
    });
    
    // Update display
    document.getElementById('currentCode').textContent = maskActivationCode(activationCode);
    
    showMessage('success', 'Configuration saved successfully!');
  } catch (error) {
    console.error('Failed to save configuration:', error);
    showMessage('error', 'Failed to save configuration');
  }
}

function validateActivationCodeFormat(code) {
  return code.length >= 16 && code.length <= 32;
}

function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'https:' || urlObj.protocol === 'http:';
  } catch {
    return false;
  }
}

function maskActivationCode(code) {
  if (code.length <= 8) {
    return '*'.repeat(code.length);
  }
  
  const visibleChars = 4;
  const start = code.substring(0, visibleChars);
  const end = code.substring(code.length - visibleChars);
  return `${start}${'*'.repeat(code.length - visibleChars * 2)}${end}`;
}

function formatDateTime(date) {
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  return date.toLocaleDateString('en-US', options);
}

function showMessage(type, text) {
  const messageDiv = document.getElementById('message');
  messageDiv.className = `message ${type}`;
  messageDiv.textContent = text;
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 5000);
}
