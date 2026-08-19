// 测试检测逻辑
const fetch = require('node-fetch');

async function testCheck() {
  // 从数据库获取账号
  const response = await fetch('http://localhost:3001/admin/session-keys');
  const data = await response.json();
  
  if (!data.success || data.keys.length === 0) {
    console.log('没有账号可测试');
    return;
  }
  
  const key = data.keys[0];
  console.log('测试账号:', key.email);
  console.log('ID:', key.id);
  
  // 手动检测
  const headers = {
    'accept': '*/*',
    'content-type': 'application/json',
    'origin': 'https://claude.ai',
    'referer': 'https://claude.ai/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'accept-language': 'en-US,en;q=0.9',
    'anthropic-client-platform': 'web_claude_ai',
    'anthropic-client-version': '1.0.0',
    'anthropic-client-sha': '882d9a7d43eced6a100e636e1dfdebc55764bd78',
  };
  
  // 构造完整的sessionKey
  const fullKey = key.keyPreview; // 这只是预览，需要完整的
  
  console.log('\n请在管理后台执行批量检测，然后查看浏览器Console的debug信息');
  console.log('或者提供完整的sessionKey，我可以帮你测试');
}

testCheck().catch(console.error);
