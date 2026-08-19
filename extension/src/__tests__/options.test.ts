/**
 * Unit Tests for options page logic
 * Tests cover: validateCodeFormat, maskCode, form submit, init (DOMContentLoaded)
 */

// ─── Chrome mock ──────────────────────────────────────────────────────────────

const mockStorageGet = jest.fn();
const mockStorageSet = jest.fn();

const mockChrome = {
  storage: {
    local: {
      get: mockStorageGet,
      set: mockStorageSet,
    },
  },
};

global.chrome = mockChrome as unknown as typeof chrome;

// ─── DOM helpers ──────────────────────────────────────────────────────────────

function buildDOM(): void {
  document.body.innerHTML = `
    <form id="optionsForm" novalidate>
      <input type="text" id="activationCode" class="form-input" />
      <p id="activationCodeError" class="form-error" hidden></p>
      <input type="url" id="apiEndpoint" class="form-input" />
      <button type="submit" id="saveButton">保存配置</button>
    </form>
    <div id="successMsg" class="feedback feedback-success" role="status" hidden>✓ 配置已保存</div>
    <div id="errorMsg" class="feedback feedback-error" role="alert" hidden></div>
    <div id="currentConfig" class="current-config" hidden>
      <p class="current-config-label">当前配置：</p>
      <p id="currentCode" class="current-config-value"></p>
    </div>
  `;
}

// ─── Import helpers under test ────────────────────────────────────────────────

import { validateCodeFormat, maskCode } from '../options';

// ─── validateCodeFormat ───────────────────────────────────────────────────────

describe('validateCodeFormat()', () => {
  test('returns true for valid 16-char alphanumeric code', () => {
    expect(validateCodeFormat('ABCD1234EFGH5678')).toBe(true);
  });

  test('returns true for hyphenated format (strips hyphens to 16 chars)', () => {
    expect(validateCodeFormat('ABCD-1234-EFGH-5678')).toBe(true);
  });

  test('returns true for 32-char code', () => {
    expect(validateCodeFormat('ABCD1234EFGH5678ABCD1234EFGH5678')).toBe(true);
  });

  test('returns true for exactly 16 chars after stripping hyphens', () => {
    expect(validateCodeFormat('1234567890123456')).toBe(true);
  });

  test('returns true for exactly 32 chars after stripping hyphens', () => {
    const code = 'A'.repeat(32);
    expect(validateCodeFormat(code)).toBe(true);
  });

  test('returns false for empty string', () => {
    expect(validateCodeFormat('')).toBe(false);
  });

  test('returns false for whitespace-only string', () => {
    expect(validateCodeFormat('   ')).toBe(false);
  });

  test('returns false for < 16 chars (stripped)', () => {
    expect(validateCodeFormat('ABCD1234')).toBe(false);
  });

  test('returns false for 15 chars (one short)', () => {
    expect(validateCodeFormat('ABCD1234EFGH567')).toBe(false);
  });

  test('returns false for > 32 chars (stripped)', () => {
    const code = 'A'.repeat(33);
    expect(validateCodeFormat(code)).toBe(false);
  });

  test('returns false for 33 chars (one over)', () => {
    expect(validateCodeFormat('A'.repeat(33))).toBe(false);
  });

  test('hyphens are stripped before length check', () => {
    // 20 chars + 4 hyphens = 24 total but stripped = 20, valid
    expect(validateCodeFormat('ABCD-EFGH-IJKL-MNOP-QR')).toBe(true);
  });
});

// ─── maskCode ─────────────────────────────────────────────────────────────────

describe('maskCode()', () => {
  test('shows first 4 and last 4 chars, masks the middle with *', () => {
    const result = maskCode('ABCD1234EFGH5678');
    expect(result).toBe('ABCD' + '*'.repeat(8) + '5678');
  });

  test('middle mask length equals code.length - 8', () => {
    const code = 'ABCDEFGHIJKLMNOP'; // 16 chars
    const result = maskCode(code);
    expect(result).toBe('ABCD' + '*'.repeat(8) + 'MNOP');
  });

  test('works for longer codes (32 chars)', () => {
    const code = 'ABCD' + 'X'.repeat(24) + 'ZZZZ';
    const result = maskCode(code);
    expect(result).toBe('ABCD' + '*'.repeat(24) + 'ZZZZ');
  });

  test('short code of exactly 8 chars returned as-is', () => {
    expect(maskCode('ABCD1234')).toBe('ABCD1234');
  });

  test('short code of < 8 chars returned as-is', () => {
    expect(maskCode('ABCD')).toBe('ABCD');
  });

  test('9-char code masks 1 middle char', () => {
    const result = maskCode('ABCD12345');
    expect(result).toBe('ABCD' + '*'.repeat(1) + '2345');
  });

  test('empty string returned as-is (length 0 ≤ 8)', () => {
    expect(maskCode('')).toBe('');
  });
});

// ─── Form submit ──────────────────────────────────────────────────────────────

describe('Options form submit — valid code', () => {
  beforeEach(() => {
    buildDOM();
    jest.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
    mockStorageSet.mockResolvedValue(undefined);
  });

  async function submitForm(code: string, endpoint = 'https://api.example.com'): Promise<void> {
    (document.getElementById('activationCode') as HTMLInputElement).value = code;
    (document.getElementById('apiEndpoint') as HTMLInputElement).value = endpoint;

    // Register the submit listener by firing DOMContentLoaded
    document.dispatchEvent(new Event('DOMContentLoaded'));
    // Let loadActivationCode resolve
    await Promise.resolve();
    await Promise.resolve();

    const form = document.getElementById('optionsForm') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    // Wait for async handlers
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  test('calls chrome.storage.local.set with activationCode and apiEndpoint', async () => {
    await submitForm('ABCD1234EFGH5678', 'https://api.example.com');
    expect(mockStorageSet).toHaveBeenCalledWith({
      activationCode: 'ABCD1234EFGH5678',
      apiEndpoint: 'https://api.example.com',
    });
  });

  test('shows #successMsg (hidden=false) with ✓ text', async () => {
    await submitForm('ABCD1234EFGH5678');
    const successMsg = document.getElementById('successMsg')!;
    expect(successMsg.hidden).toBe(false);
    expect(successMsg.textContent).toContain('✓');
  });

  test('updates #currentCode with masked code', async () => {
    await submitForm('ABCD1234EFGH5678');
    const currentCode = document.getElementById('currentCode')!;
    expect(currentCode.textContent).toBe('ABCD' + '*'.repeat(8) + '5678');
  });

  test('shows #currentConfig after save', async () => {
    await submitForm('ABCD1234EFGH5678');
    const currentConfig = document.getElementById('currentConfig')!;
    expect(currentConfig.hidden).toBe(false);
  });

  test('re-enables saveButton after save (finally block)', async () => {
    const button = document.getElementById('saveButton') as HTMLButtonElement;
    await submitForm('ABCD1234EFGH5678');
    expect(button.disabled).toBe(false);
  });
});

describe('Options form submit — invalid code (< 16 chars)', () => {
  beforeEach(() => {
    buildDOM();
    jest.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
    mockStorageSet.mockResolvedValue(undefined);
  });

  async function submitForm(code: string): Promise<void> {
    (document.getElementById('activationCode') as HTMLInputElement).value = code;
    (document.getElementById('apiEndpoint') as HTMLInputElement).value = '';

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    await Promise.resolve();

    const form = document.getElementById('optionsForm') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  test('does NOT call chrome.storage.local.set', async () => {
    await submitForm('SHORT');
    expect(mockStorageSet).not.toHaveBeenCalled();
  });

  test('shows #activationCodeError', async () => {
    await submitForm('SHORT');
    const errEl = document.getElementById('activationCodeError')!;
    expect(errEl.hidden).toBe(false);
  });

  test('adds input-error class to #activationCode input', async () => {
    await submitForm('SHORT');
    const input = document.getElementById('activationCode')!;
    expect(input.classList.contains('input-error')).toBe(true);
  });
});

describe('Options form submit — storage error on save', () => {
  beforeEach(() => {
    buildDOM();
    jest.clearAllMocks();
    mockStorageGet.mockResolvedValue({});
    mockStorageSet.mockRejectedValue(new Error('Quota exceeded'));
  });

  async function submitForm(code: string): Promise<void> {
    (document.getElementById('activationCode') as HTMLInputElement).value = code;
    (document.getElementById('apiEndpoint') as HTMLInputElement).value = '';

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    await Promise.resolve();

    const form = document.getElementById('optionsForm') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  test('shows error message in #errorMsg when storage throws', async () => {
    await submitForm('ABCD1234EFGH5678');
    const errEl = document.getElementById('errorMsg')!;
    expect(errEl.hidden).toBe(false);
    expect(errEl.textContent).toContain('保存失败');
  });

  test('re-enables saveButton even when save throws (finally block)', async () => {
    const button = document.getElementById('saveButton') as HTMLButtonElement;
    await submitForm('ABCD1234EFGH5678');
    expect(button.disabled).toBe(false);
  });
});

// ─── DOMContentLoaded / init ──────────────────────────────────────────────────

describe('DOMContentLoaded init — with stored activationCode', () => {
  beforeEach(() => {
    buildDOM();
    jest.clearAllMocks();
  });

  test('displays masked activationCode in #currentCode', async () => {
    mockStorageGet.mockResolvedValue({
      activationCode: 'ABCD1234EFGH5678',
      apiEndpoint: 'https://stored.example.com',
    });

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    await Promise.resolve();

    const currentCode = document.getElementById('currentCode')!;
    expect(currentCode.textContent).toBe('ABCD' + '*'.repeat(8) + '5678');
  });

  test('shows #currentConfig when stored code exists', async () => {
    mockStorageGet.mockResolvedValue({ activationCode: 'ABCD1234EFGH5678' });

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    await Promise.resolve();

    const currentConfig = document.getElementById('currentConfig')!;
    expect(currentConfig.hidden).toBe(false);
  });

  test('fills #apiEndpoint input with stored apiEndpoint', async () => {
    mockStorageGet.mockResolvedValue({
      activationCode: 'ABCD1234EFGH5678',
      apiEndpoint: 'https://stored.example.com',
    });

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    await Promise.resolve();

    const endpointInput = document.getElementById('apiEndpoint') as HTMLInputElement;
    expect(endpointInput.value).toBe('https://stored.example.com');
  });
});

describe('DOMContentLoaded init — no stored activationCode', () => {
  beforeEach(() => {
    buildDOM();
    jest.clearAllMocks();
  });

  test('#currentConfig stays hidden when no stored code', async () => {
    mockStorageGet.mockResolvedValue({});

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await Promise.resolve();
    await Promise.resolve();

    const currentConfig = document.getElementById('currentConfig')!;
    expect(currentConfig.hidden).toBe(true);
  });
});
