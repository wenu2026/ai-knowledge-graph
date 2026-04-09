/**
 * 飞书 API 客户端模块
 * 封装所有飞书开放平台 API 调用
 */

const FEISHU_BASE_URL = 'https://open.feishu.cn/open-apis';

// 令牌缓存
let tokenCache = {
  token: null,
  expiresAt: 0,
};

/**
 * 获取租户访问令牌（Tenant Access Token）
 * 使用 app_id 和 app_secret 获取，结果会缓存以减少请求次数
 * @param {Object} env - Cloudflare Workers 环境变量
 * @returns {Promise<string>} 访问令牌
 */
export async function getTenantAccessToken(env) {
  // 检查缓存是否有效（提前5分钟过期）
  if (tokenCache.token && Date.now() < tokenCache.expiresAt - 300000) {
    return tokenCache.token;
  }

  const url = `${FEISHU_BASE_URL}/auth/v3/tenant_access_token/internal`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`获取飞书访问令牌失败: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`飞书认证失败: ${data.code} ${data.msg}`);
  }

  // 缓存令牌
  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + data.expire * 1000,
  };

  return tokenCache.token;
}

/**
 * 发起飞书 API 请求的通用方法
 * 自动添加认证头和处理错误
 * @param {string} token - 访问令牌
 * @param {string} path - API 路径
 * @param {Object} options - fetch 选项
 * @returns {Promise<Object>} API 响应数据
 */
async function feishuRequest(token, path, options = {}) {
  const url = `${FEISHU_BASE_URL}${path}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json; charset=utf-8',
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`飞书 API 请求失败 [${path}]: ${response.status} ${errorText}`);
  }

  const data = await response.json();

  if (data.code !== 0) {
    // 处理限流
    if (data.code === 99991668 || data.code === 99991664) {
      throw new Error(`飞书 API 限流，请稍后重试: ${data.code} ${data.msg}`);
    }
    throw new Error(`飞书 API 错误 [${path}]: ${data.code} ${data.msg}`);
  }

  return data;
}

/**
 * 列出多维表格中的所有记录
 * 自动处理分页，返回完整记录列表
 * @param {Object} env - 环境变量
 * @param {string} appToken - 多维表格 App Token
 * @param {string} tableId - 数据表 ID
 * @param {Object} [filters] - 可选的筛选条件
 * @param {number} [pageSize] - 每页大小，默认 500
 * @returns {Promise<Array>} 记录列表
 */
export async function listBitableRecords(env, appToken, tableId, filters = null, pageSize = 500) {
  const token = await getTenantAccessToken(env);
  const allRecords = [];
  let pageToken = null;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      page_size: String(pageSize),
    });

    if (pageToken) {
      params.set('page_token', pageToken);
    }

    // 添加筛选条件
    if (filters) {
      params.set('filter', JSON.stringify(filters));
    }

    const path = `/bitable/v1/apps/${appToken}/tables/${tableId}/records?${params.toString()}`;
    const data = await feishuRequest(token, path);

    if (data.data && data.data.items) {
      allRecords.push(...data.data.items);
    }

    hasMore = !!(data.data && data.data.has_more);
    pageToken = data.data ? data.data.page_token : null;

    // 防止无限循环
    if (allRecords.length > 10000) {
      console.warn('记录数量超过10000条，停止分页查询');
      break;
    }
  }

  return allRecords;
}

/**
 * 获取单条多维表格记录
 * @param {Object} env - 环境变量
 * @param {string} appToken - 多维表格 App Token
 * @param {string} tableId - 数据表 ID
 * @param {string} recordId - 记录 ID
 * @returns {Promise<Object>} 记录数据
 */
export async function getBitableRecord(env, appToken, tableId, recordId) {
  const token = await getTenantAccessToken(env);
  const path = `/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
  const data = await feishuRequest(token, path);
  return data.data.record;
}

/**
 * 创建多维表格记录
 * @param {Object} env - 环境变量
 * @param {string} appToken - 多维表格 App Token
 * @param {string} tableId - 数据表 ID
 * @param {Object} fields - 记录字段
 * @returns {Promise<Object>} 创建的记录
 */
export async function createBitableRecord(env, appToken, tableId, fields) {
  const token = await getTenantAccessToken(env);
  const path = `/bitable/v1/apps/${appToken}/tables/${tableId}/records`;
  const data = await feishuRequest(token, path, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
  return data.data.record;
}

/**
 * 批量创建多维表格记录
 * @param {Object} env - 环境变量
 * @param {string} appToken - 多维表格 App Token
 * @param {string} tableId - 数据表 ID
 * @param {Array<Object>} records - 记录字段数组
 * @returns {Promise<Object>} 创建结果
 */
export async function batchCreateBitableRecords(env, appToken, tableId, records) {
  const token = await getTenantAccessToken(env);
  const path = `/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_create`;

  // 飞书批量创建限制每次最多500条
  const BATCH_SIZE = 500;
  const results = [];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const data = await feishuRequest(token, path, {
      method: 'POST',
      body: JSON.stringify({ records: batch }),
    });
    results.push(...(data.data.records || []));
  }

  return results;
}

/**
 * 更新多维表格记录
 * @param {Object} env - 环境变量
 * @param {string} appToken - 多维表格 App Token
 * @param {string} tableId - 数据表 ID
 * @param {string} recordId - 记录 ID
 * @param {Object} fields - 要更新的字段
 * @returns {Promise<Object>} 更新后的记录
 */
export async function updateBitableRecord(env, appToken, tableId, recordId, fields) {
  const token = await getTenantAccessToken(env);
  const path = `/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
  const data = await feishuRequest(token, path, {
    method: 'PUT',
    body: JSON.stringify({ fields }),
  });
  return data.data.record;
}

/**
 * 批量更新多维表格记录
 * @param {Object} env - 环境变量
 * @param {string} appToken - 多维表格 App Token
 * @param {string} tableId - 数据表 ID
 * @param {Array<Object>} records - 要更新的记录数组 [{record_id, fields}]
 * @returns {Promise<Object>} 更新结果
 */
export async function batchUpdateBitableRecords(env, appToken, tableId, records) {
  const token = await getTenantAccessToken(env);
  const path = `/bitable/v1/apps/${appToken}/tables/${tableId}/records/batch_update`;

  const BATCH_SIZE = 500;
  const results = [];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const data = await feishuRequest(token, path, {
      method: 'POST',
      body: JSON.stringify({ records: batch }),
    });
    results.push(...(data.data.records || []));
  }

  return results;
}

/**
 * 获取文档内容（文本/Markdown格式）
 * 支持飞书文档和文档块内容
 * @param {Object} env - 环境变量
 * @param {string} docToken - 文档 Token
 * @returns {Promise<string>} 文档文本内容
 */
export async function getDocumentContent(env, docToken) {
  const token = await getTenantAccessToken(env);

  // 获取文档原始内容（以块为单位）
  const blocks = await getAllDocumentBlocks(token, docToken);

  // 将块内容转换为纯文本
  return blocksToText(blocks);
}

/**
 * 获取文档所有块（自动分页）
 * @param {string} token - 访问令牌
 * @param {string} docToken - 文档 Token
 * @returns {Promise<Array>} 文档块列表
 */
async function getAllDocumentBlocks(token, docToken) {
  const allBlocks = [];
  let pageToken = null;
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams({
      document_id: docToken,
      page_size: '500',
    });

    if (pageToken) {
      params.set('page_token', pageToken);
    }

    const path = `/docx/v1/documents/${docToken}/blocks/${docToken}/children?${params.toString()}`;
    const data = await feishuRequest(token, path);

    if (data.data && data.data.items) {
      allBlocks.push(...data.data.items);
    }

    hasMore = !!(data.data && data.data.has_more);
    pageToken = data.data ? data.data.page_token : null;
  }

  return allBlocks;
}

/**
 * 将文档块转换为纯文本
 * @param {Array} blocks - 文档块列表
 * @returns {string} 纯文本内容
 */
function blocksToText(blocks) {
  const lines = [];

  for (const block of blocks) {
    const text = extractBlockText(block);
    if (text.trim()) {
      lines.push(text);
    }
  }

  return lines.join('\n');
}

/**
 * 从单个块中提取文本
 * @param {Object} block - 文档块
 * @returns {string} 块文本
 */
function extractBlockText(block) {
  const blockType = block.block_type;

  switch (blockType) {
    case 1: // 文本段落
    case 17: { // 引用
      return extractRichText(block.text);
    }
    case 2: { // 标题1
      return `# ${extractRichText(block.heading1)}`;
    }
    case 3: { // 标题2
      return `## ${extractRichText(block.heading2)}`;
    }
    case 4: { // 标题3
      return `### ${extractRichText(block.heading3)}`;
    }
    case 5: { // 标题4
      return `#### ${extractRichText(block.heading4)}`;
    }
    case 6: { // 标题5
      return `##### ${extractRichText(block.heading5)}`;
    }
    case 7: { // 标题6
      return `###### ${extractRichText(block.heading6)}`;
    }
    case 13: { // 无序列表
      return `- ${extractRichText(block.bullet)}`;
    }
    case 14: { // 有序列表
      return `1. ${extractRichText(block.ordered)}`;
    }
    case 15: { // 代码块
      return `\n\`\`\`\n${block.code.text || ''}\n\`\`\`\n`;
    }
    case 16: { // 引用块
      return `> ${extractRichText(block.quote)}`;
    }
    case 18: { // 分割线
      return '---';
    }
    case 22: { // 表格
      return extractTableText(block.table);
    }
    default:
      return '';
  }
}

/**
 * 从富文本元素中提取纯文本
 * @param {Object} richText - 富文本对象
 * @returns {string} 纯文本
 */
function extractRichText(richText) {
  if (!richText || !richText.elements) return '';

  return richText.elements
    .map((el) => {
      if (el.text_run) {
        return el.text_run.content || '';
      }
      if (el.mention_doc) {
        return `[文档: ${el.mention_doc.title || ''}]`;
      }
      if (el.person) {
        return `[@${el.person.name || ''}]`;
      }
      return '';
    })
    .join('');
}

/**
 * 从表格块中提取文本
 * @param {Object} table - 表格块数据
 * @returns {string} 表格文本
 */
function extractTableText(table) {
  if (!table || !table.rows) return '';

  return table.rows
    .map((row) => {
      return row.cells
        .map((cell) => {
          if (cell && cell.content && cell.content.length > 0) {
            return cell.content[0].text_run
              ? cell.content[0].text_run.content || ''
              : '';
          }
          return '';
        })
        .join(' | ');
    })
    .join('\n');
}

/**
 * 获取多维表格中字段的元数据信息
 * @param {Object} env - 环境变量
 * @param {string} appToken - 多维表格 App Token
 * @param {string} tableId - 数据表 ID
 * @returns {Promise<Array>} 字段列表
 */
export async function listBitableFields(env, appToken, tableId) {
  const token = await getTenantAccessToken(env);
  const path = `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
  const data = await feishuRequest(token, path);
  return data.data.fields || [];
}
