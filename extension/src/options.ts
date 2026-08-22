/**
 * Options Page Controller for Claude Account Switcher
 * Handles activation code configuration and persistence.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id) as T | null;
  if (!el) throw new Error(`Element #${id} not found`);
  return el;
}

// ── Validation (8.6) ───────────────────────────────────────────────────────

/**
 * Validate activation code format: 16-32 alphanumeric characters (hyphens stripped).
 */
export function validateCodeFormat(code: string): boolean {
  if (!code || code.trim().length === 0) return false;
  const stripped = code.replace(/-/g, '').trim();
  return stripped.length >= 16 && stripped.length <= 32;
}

// ── Feedback helpers ───────────────────────────────────────────────────────

function showSuccess(message: string): void {
  const el = getEl<HTMLDivElement>('successMsg');
  const errEl = getEl<HTMLDivElement>('errorMsg');
  el.textContent = `✓ ${message}`;
  el.hidden = false;
  errEl.hidden = true;
  setTimeout(() => { el.hidden = true; }, 3000);
}

function showError(message: string): void {
  const el = getEl<HTMLDivElement>('errorMsg');
  const successEl = getEl<HTMLDivElement>('successMsg');
  el.textContent = message;
  el.hidden = false;
  successEl.hidden = true;
}

function clearFeedback(): void {
  getEl<HTMLDivElement>('successMsg').hidden = true;
  getEl<HTMLDivElement>('errorMsg').hidden = true;
  const codeInput = getEl<HTMLInputElement>('activationCode');
  codeInput.classList.remove('input-error');
  getEl<HTMLParagraphElement>('activationCodeError').hidden = true;
}

// ── Storage operations ─────────────────────────────────────────────────────

/**
 * Load current activation code from storage (8.8) and display it (8.9).
 */
async function loadActivationCode(): Promise<void> {
  try {
    const data = await chrome.storage.local.get(['activationCode']) as {
      activationCode?: string;
    };

    if (data.activationCode) {
      // Show masked version of the current code (8.9)
      const currentConfigEl = getEl<HTMLDivElement>('currentConfig');
      const currentCodeEl = getEl<HTMLParagraphElement>('currentCode');
      const masked = maskCode(data.activationCode);
      currentCodeEl.textContent = masked;
      currentConfigEl.hidden = false;
    }
  } catch {
    // Silently ignore on load
  }
}

/**
 * Mask activation code for display — show first 4 and last 4 chars.
 */
export function maskCode(code: string): string {
  if (code.length <= 8) return code;
  return `${code.slice(0, 4)}${'*'.repeat(code.length - 8)}${code.slice(-4)}`;
}

/**
 * Save activation code to storage (8.7).
 */
async function saveActivationCode(code: string): Promise<void> {
  await chrome.storage.local.set({ activationCode: code.trim() });
}

// ── Form submit handler ────────────────────────────────────────────────────

async function handleSave(event: Event): Promise<void> {
  event.preventDefault();
  clearFeedback();

  const codeInput   = getEl<HTMLInputElement>('activationCode');
  const saveButton  = getEl<HTMLButtonElement>('saveButton');
  const codeError   = getEl<HTMLParagraphElement>('activationCodeError');

  const code = codeInput.value.trim();

  // Validate activation code (8.6)
  if (!validateCodeFormat(code)) {
    codeInput.classList.add('input-error');
    codeError.textContent = '激活码格式无效，请输入 16-32 个字符';
    codeError.hidden = false;
    codeInput.focus();
    return;
  }

  saveButton.disabled = true;

  try {
    await saveActivationCode(code);
    showSuccess('配置已保存');  // (8.10)

    // Update displayed current code (8.9)
    const currentConfigEl = getEl<HTMLDivElement>('currentConfig');
    getEl<HTMLParagraphElement>('currentCode').textContent = maskCode(code);
    currentConfigEl.hidden = false;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '保存失败';
    showError(`保存失败：${msg}`);  // (8.11)
  } finally {
    saveButton.disabled = false;
  }
}

// ── Initialization ─────────────────────────────────────────────────────────

async function initialize(): Promise<void> {
  await loadActivationCode();
  getEl<HTMLFormElement>('optionsForm').addEventListener('submit', (e) => { void handleSave(e); });
}

document.addEventListener('DOMContentLoaded', () => { void initialize(); });
