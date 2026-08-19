import { ResultSetHeader } from 'mysql2/promise';
import { query } from './index';

/**
 * 种子数据脚本 - 仅用于测试环境
 * 可重复运行：先清除 TEST- 前缀的记录，再重新插入
 */
async function seed(): Promise<void> {
  // 清除已有的测试数据（code 以 TEST- 开头）
  await query<ResultSetHeader>(
    "DELETE FROM `activation_codes` WHERE `code` LIKE 'TEST-%'"
  );

  console.log('已清除旧测试数据');

  const now = new Date();

  // 1. 有效激活码：isActive=true, 未过期, usedCount < maxUses
  const futureDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 年后
  await query<ResultSetHeader>(
    `INSERT INTO \`activation_codes\`
       (\`code\`, \`maxUses\`, \`usedCount\`, \`expiryDate\`, \`isActive\`)
     VALUES (?, ?, ?, ?, ?)`,
    ['TEST-ABCD-EFGH-IJKL', 100, 5, futureDate, true]
  );

  // 2. 已过期激活码：expiryDate 设为过去
  const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 昨天
  await query<ResultSetHeader>(
    `INSERT INTO \`activation_codes\`
       (\`code\`, \`maxUses\`, \`usedCount\`, \`expiryDate\`, \`isActive\`)
     VALUES (?, ?, ?, ?, ?)`,
    ['TEST-EXPR-IRED-CODE', 100, 0, pastDate, true]
  );

  // 3. 已禁用激活码：isActive=false
  await query<ResultSetHeader>(
    `INSERT INTO \`activation_codes\`
       (\`code\`, \`maxUses\`, \`usedCount\`, \`expiryDate\`, \`isActive\`)
     VALUES (?, ?, ?, ?, ?)`,
    ['TEST-DISA-BLED-CODE', 100, 0, futureDate, false]
  );

  // 4. 次数用完激活码：usedCount=maxUses
  await query<ResultSetHeader>(
    `INSERT INTO \`activation_codes\`
       (\`code\`, \`maxUses\`, \`usedCount\`, \`expiryDate\`, \`isActive\`)
     VALUES (?, ?, ?, ?, ?)`,
    ['TEST-NOUS-ESLE-FTCO', 10, 10, futureDate, true]
  );

  console.log('种子数据插入完成：');
  console.log('  TEST-ABCD-EFGH-IJKL  - 有效激活码 (maxUses=100, usedCount=5)');
  console.log('  TEST-EXPR-IRED-CODE  - 已过期激活码');
  console.log('  TEST-DISA-BLED-CODE  - 已禁用激活码 (isActive=false)');
  console.log('  TEST-NOUS-ESLE-FTCO  - 次数用完激活码 (maxUses=10, usedCount=10)');
}

seed()
  .then(() => {
    console.log('Seed 完成');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed 失败:', err);
    process.exit(1);
  });
