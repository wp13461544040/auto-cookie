// Popup UI Controller
document.addEventListener('DOMContentLoaded', initialize);

async function initialize() {
  const switchButton = document.getElementById('switchButton');
  const optionsLink = document.getElementById('optionsLink');
  
  // Load cached status
  await loadCachedStatus();
  
  // Event listeners
  switchButton.addEventListener('click', handleSwitchAccount);
  optionsLink.addEventListener('click', openOptions);
}

async function loadCachedStatus() {
  try {
    const data = await chrome.storage.local.get(['remainingUses', 'lastSwitchTime']);
    
    if (data.remainingUses !== undefined) {
      updateRemainingUses(data.remainingUses);
    }
  } catch (error) {
    console.error('Failed to load cached status:', error);
  }
}

async function handleSwitchAccount() {
  const switchButton = document.getElementById('switchButton');
  
  // Disable button and show loading
  switchButton.disabled = true;
  updateStatus('loading', 'Switching account...');
  
  try {
    // Send message to background service worker
    const response = await chrome.runtime.sendMessage({
      action: 'switchAccount'
    });
    
    if (response.success) {
      updateStatus('success', 'Account switched successfully!');
      updateRemainingUses(response.remainingUses);
    } else {
      updateStatus('error', response.error || 'Failed to switch account');
    }
  } catch (error) {
    updateStatus('error', `Error: ${error.message}`);
  } finally {
    switchButton.disabled = false;
  }
}

function updateStatus(type, message) {
  const statusDiv = document.getElementById('status');
  const statusMessage = document.getElementById('statusMessage');
  
  statusDiv.className = `status ${type}`;
  statusMessage.textContent = message;
}

function updateRemainingUses(count) {
  const remainingUsesDiv = document.getElementById('remainingUses');
  
  if (count !== undefined && count !== null) {
    remainingUsesDiv.textContent = `Remaining uses: ${count}`;
  } else {
    remainingUsesDiv.textContent = '';
  }
}

function openOptions(event) {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
}
