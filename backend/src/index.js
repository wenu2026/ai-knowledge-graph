/**
 * AI 知识图谱 - Cloudflare Workers 主入口
 *
 * 整合飞书 API 客户端、LLM 抽取模块和图谱转换模块，
 * 提供 RESTful API 供前端调用，支持定时同步和手动触发。
 */

import {
  getTenantAccessToken,
  listBitableRecords,
  getDocumentContent,
  createBitableRecord,
  updateBitableRecord,
  batchCreateBitableRecords,
} from './feishu.js';

import {
  extractEntitiesAndRelations,
  buildExtractionPrompt,
} from './llm.js';

import {
  buildGraphData,
  mergeWithStaticData,
} from './graph.js';

// ============================================================================
// 静态分类回退数据 - 确保即使飞书为空也能返回有效的分类信息
// ============================================================================

const STATIC_CATEGORIES = [
  { name: '基础概念', color: '#6366f1' },
  { name: '核心领域', color: '#ec4899' },
  { name: '学习方法', color: '#f59e0b' },
  { name: '模型架构', color: '#10b981' },
  { name: '语言模型', color: '#3b82f6' },
  { name: '多模态模型', color: '#8b5cf6' },
  { name: '应用技术', color: '#ef4444' },
  { name: '表示学习', color: '#14b8a6' },
  { name: '训练技术', color: '#f97316' },
  { name: '计算机视觉', color: '#06b6d4' },
  { name: '自然语言处理', color: '#a855f7' },
  { name: '语音技术', color: '#84cc16' },
  { name: '应用领域', color: '#e11d48' },
  { name: '前沿方向', color: '#7c3aed' },
  { name: '工程实践', color: '#0ea5e9' },
  { name: '工具框架', color: '#d946ef' },
  { name: '硬件基础', color: '#78716c' },
  { name: 'AI安全', color: '#dc2626' },
  { name: '里程碑', color: '#eab308' },
  { name: '应用产品', color: '#22c55e' },
];

// ============================================================================
// 全局同步状态（简单方案，Workers 单实例内有效）
// ============================================================================

let syncState = {
  lastSyncTime: null,
  lastSyncStatus: 'idle', // idle | syncing | success | error
  lastErrorMessage: null,
};

// ============================================================================
// 缓存相关常量
// ============================================================================

const CACHE_KEY = 'graph-data';
const CACHE_TTL = 3600; // 缓存有效期：1小时（秒）

// ============================================================================
// CORS 辅助函数
// ============================================================================

/**
 * 构建跨域资源共享（CORS）响应头
 * 支持配置指定来源或开发环境下的通配符
 * @param {Request} request - 请求对象
 * @returns {Object} CORS 响应头对象
 */
function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  // 如果配置了 CORS_ORIGIN 且与请求来源匹配，则使用配置的来源
  // 否则使用通配符 *（适用于开发环境）
  const allowedOrigin = origin || '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 预检请求缓存24小时
  };
}

// ============================================================================
// JSON 响应辅助函数
// ============================================================================

/**
 * 构建带有 CORS 头的 JSON 响应
 * @param {*} data - 响应数据，将被序列化为 JSON
 * @param {number} [status=200] - HTTP 状态码
 * @param {Object} [extraHeaders={}] - 额外的响应头
 * @returns {Response} Response 对象
 */
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

// ============================================================================
// 核心同步逻辑
// ============================================================================

/**
 * 从飞书多维表格同步知识图谱数据
 * 依次获取分类、节点、关系数据，并转换为前端所需的图谱格式
 * @param {Object} env - Cloudflare Workers 环境变量
 * @returns {Promise<Object>} 图谱数据对象 { nodes, edges, categories }
 */
async function syncFromFeishu(env) {
  const appToken = env.FEISHU_BITABLE_APP_TOKEN;

  // 1. 获取租户访问令牌（验证连接是否正常）
  await getTenantAccessToken(env);

  // 2. 并行获取所有表格数据，提升同步效率
  const [categoryRecords, nodeRecords, edgeRecords] = await Promise.all([
    listBitableRecords(env, appToken, env.FEISHU_CATEGORIES_TABLE_ID).catch((err) => {
      console.error('获取分类数据失败:', err.message);
      return []; // 分类获取失败时返回空数组，后续使用静态回退
    }),
    listBitableRecords(env, appToken, env.FEISHU_NODES_TABLE_ID).catch((err) => {
      console.error('获取节点数据失败:', err.message);
      return [];
    }),
    listBitableRecords(env, appToken, env.FEISHU_EDGES_TABLE_ID).catch((err) => {
      console.error('获取关系数据失败:', err.message);
      return [];
    }),
  ]);

  // 3. 使用 graph 模块将飞书原始记录转换为图谱格式
  let graphData = buildGraphData(nodeRecords, edgeRecords, categoryRecords);

  // 4. 如果飞书数据为空，使用静态分类数据作为回退
  //    前端本身已内置静态数据，这里确保 API 始终返回有效的分类结构
  if (!graphData.categories || graphData.categories.length === 0) {
    graphData.categories = STATIC_CATEGORIES;
  }

  // 5. 如果节点和关系都为空，返回空图谱结构（前端会使用内置数据）
  if (!graphData.nodes) graphData.nodes = [];
  if (!graphData.edges) graphData.edges = [];

  // 6. 更新同步状态
  syncState = {
    lastSyncTime: new Date().toISOString(),
    lastSyncStatus: 'success',
    lastErrorMessage: null,
  };

  console.log(
    `同步完成: ${graphData.nodes.length} 个节点, ${graphData.edges.length} 条关系, ${graphData.categories.length} 个分类`,
  );

  return graphData;
}

// ============================================================================
// 缓存操作
// ============================================================================

/**
 * 从 Cache API 获取缓存的图谱数据
 * @param {Request} request - 原始请求对象（用于构建缓存 URL）
 * @returns {Promise<Response|null>} 缓存的响应，未命中时返回 null
 */
async function getCache(request) {
  try {
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = '/api/graph';
    const cache = caches.default;
    const cachedResponse = await cache.match(cacheUrl.toString());
    return cachedResponse;
  } catch (err) {
    console.warn('读取缓存失败:', err.message);
    return null;
  }
}

/**
 * 将图谱数据写入 Cache API
 * @param {Request} request - 原始请求对象
 * @param {Object} graphData - 图谱数据
 * @returns {Promise<void>}
 */
async function setCache(request, graphData) {
  try {
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = '/api/graph';
    const cache = caches.default;

    const response = new Response(JSON.stringify(graphData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
      },
    });

    const ctx = { waitUntil: (promise) => promise }; // 上下文占位
    await cache.put(cacheUrl.toString(), response);
  } catch (err) {
    console.warn('写入缓存失败:', err.message);
  }
}

/**
 * 清除图谱数据的缓存
 * @param {Request} request - 原始请求对象
 * @returns {Promise<void>}
 */
async function purgeCache(request) {
  try {
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = '/api/graph';
    const cache = caches.default;
    await cache.delete(cacheUrl.toString());
  } catch (err) {
    console.warn('清除缓存失败:', err.message);
  }
}

// ============================================================================
// 路由处理函数
// ============================================================================

/**
 * 处理 GET /api/health - 健康检查
 * @param {Request} request
 * @param {Object} env
 * @returns {Response}
 */
async function handleHealth(request, env) {
  return jsonResponse(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
    200,
    corsHeaders(request),
  );
}

/**
 * 处理 GET /api/graph - 获取知识图谱数据（前端主接口）
 * 优先从缓存读取，缓存未命中时触发同步并缓存结果
 * @param {Request} request
 * @param {Object} env
 * @param {ExecutionContext} ctx
 * @returns {Response}
 */
async function handleGraph(request, env, ctx) {
  try {
    // 尝试从缓存获取
    const cachedResponse = await getCache(request);
    if (cachedResponse) {
      // 为缓存的响应添加 CORS 头
      const headers = new Headers(cachedResponse.headers);
      headers.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        headers,
      });
    }

    // 缓存未命中，从飞书同步数据
    const graphData = await syncFromFeishu(env);

    // 异步写入缓存（不阻塞响应）
    ctx.waitUntil(setCache(request, graphData));

    return jsonResponse(graphData, 200, corsHeaders(request));
  } catch (err) {
    console.error('获取图谱数据失败:', err.message);
    return jsonResponse(
      {
        success: false,
        error: '获取图谱数据失败',
        message: err.message,
      },
      500,
      corsHeaders(request),
    );
  }
}

/**
 * 处理 POST /api/sync - 手动触发同步
 * @param {Request} request
 * @param {Object} env
 * @param {ExecutionContext} ctx
 * @returns {Response}
 */
async function handleSync(request, env, ctx) {
  try {
    // 更新同步状态为同步中
    syncState.lastSyncStatus = 'syncing';

    // 执行同步
    const graphData = await syncFromFeishu(env);

    // 清除旧缓存，下次请求会使用新数据
    await purgeCache(request);

    // 将新数据写入缓存
    ctx.waitUntil(setCache(request, graphData));

    return jsonResponse(
      {
        success: true,
        nodeCount: graphData.nodes.length,
        edgeCount: graphData.edges.length,
        categoryCount: graphData.categories.length,
        message: '同步完成',
        timestamp: syncState.lastSyncTime,
      },
      200,
      corsHeaders(request),
    );
  } catch (err) {
    console.error('手动同步失败:', err.message);
    syncState.lastSyncStatus = 'error';
    syncState.lastErrorMessage = err.message;

    return jsonResponse(
      {
        success: false,
        error: '同步失败',
        message: err.message,
      },
      500,
      corsHeaders(request),
    );
  }
}

/**
 * 处理 POST /api/extract - 从飞书文档中抽取知识实体和关系
 * @param {Request} request
 * @param {Object} env
 * @param {ExecutionContext} ctx
 * @returns {Response}
 */
async function handleExtract(request, env, ctx) {
  try {
    // 解析请求体
    const body = await request.json();
    const { docId, docType } = body;

    if (!docId) {
      return jsonResponse(
        {
          success: false,
          error: '缺少必要参数: docId',
        },
        400,
        corsHeaders(request),
      );
    }

    console.log(`开始抽取文档: ${docId} (类型: ${docType || '飞书文档'})`);

    // 1. 获取文档内容
    const text = await getDocumentContent(env, docId);

    if (!text || text.trim().length === 0) {
      return jsonResponse(
        {
          success: false,
          error: '文档内容为空，无法抽取',
        },
        400,
        corsHeaders(request),
      );
    }

    console.log(`文档内容长度: ${text.length} 字符`);

    // 2. 获取分类配置（用于 LLM 抽取时的分类参考）
    let categories = STATIC_CATEGORIES;
    try {
      const categoryRecords = await listBitableRecords(
        env,
        env.FEISHU_BITABLE_APP_TOKEN,
        env.FEISHU_CATEGORIES_TABLE_ID,
      );
      if (categoryRecords.length > 0) {
        categories = categoryRecords.map((record) => ({
          name: record.fields?.name || '',
          color: record.fields?.color || '#6366f1',
        })).filter((c) => c.name);
      }
    } catch (err) {
      console.warn('获取分类配置失败，使用静态分类:', err.message);
    }

    // 3. 调用 LLM 抽取实体和关系
    const extractionResult = await extractEntitiesAndRelations(text, categories, env);

    if (!extractionResult) {
      return jsonResponse(
        {
          success: false,
          error: 'LLM 抽取返回空结果',
        },
        500,
        corsHeaders(request),
      );
    }

    const { entities = [], relations = [] } = extractionResult;

    console.log(`抽取结果: ${entities.length} 个实体, ${relations.length} 条关系`);

    // 4. 将抽取的实体写入飞书节点表
    if (entities.length > 0) {
      const now = new Date().toISOString();
      const nodeRecords = entities.map((entity) => ({
        fields: {
          node_id: `node_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          name: entity.name || '',
          category: entity.category || '基础概念',
          description: entity.description || '',
          importance: entity.importance || 3,
          source_doc: docId,
          created_at: now,
          status: '草稿',
        },
      }));

      try {
        await batchCreateBitableRecords(
          env,
          env.FEISHU_BITABLE_APP_TOKEN,
          env.FEISHU_NODES_TABLE_ID,
          nodeRecords,
        );
        console.log(`成功写入 ${nodeRecords.length} 个节点到飞书`);
      } catch (err) {
        console.error('写入节点到飞书失败:', err.message);
        // 不中断流程，继续写入关系
      }
    }

    // 5. 将抽取的关系写入飞书关系表
    if (relations.length > 0) {
      const now = new Date().toISOString();
      const edgeRecords = relations.map((rel) => ({
        fields: {
          relation_id: `rel_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          source: rel.source || '',
          target: rel.target || '',
          relation: rel.relation || '',
          description: rel.description || '',
          source_doc: docId,
          confidence: rel.confidence || 0.8,
          extraction_method: 'LLM自动抽取',
          created_at: now,
        },
      }));

      try {
        await batchCreateBitableRecords(
          env,
          env.FEISHU_BITABLE_APP_TOKEN,
          env.FEISHU_EDGES_TABLE_ID,
          edgeRecords,
        );
        console.log(`成功写入 ${edgeRecords.length} 条关系到飞书`);
      } catch (err) {
        console.error('写入关系到飞书失败:', err.message);
      }
    }

    // 6. 更新文档队列状态为"已完成"
    //    查找队列中对应的文档记录并更新状态
    try {
      const queueRecords = await listBitableRecords(
        env,
        env.FEISHU_BITABLE_APP_TOKEN,
        env.FEISHU_QUEUE_TABLE_ID,
      );

      // 查找匹配的文档记录
      const matchedRecord = queueRecords.find(
        (record) => record.fields?.doc_id === docId,
      );

      if (matchedRecord) {
        await updateBitableRecord(
          env,
          env.FEISHU_BITABLE_APP_TOKEN,
          env.FEISHU_QUEUE_TABLE_ID,
          matchedRecord.record_id,
          {
            status: '已完成',
            last_processed: new Date().toISOString(),
          },
        );
        console.log(`已更新文档队列状态: ${docId} -> 已完成`);
      } else {
        console.warn(`未在文档队列中找到文档: ${docId}`);
      }
    } catch (err) {
      console.warn('更新文档队列状态失败:', err.message);
      // 不影响主流程
    }

    // 7. 返回抽取结果
    return jsonResponse(
      {
        success: true,
        extractedNodes: entities.length,
        extractedEdges: relations.length,
        docId,
        timestamp: new Date().toISOString(),
      },
      200,
      corsHeaders(request),
    );
  } catch (err) {
    console.error('文档抽取失败:', err.message);

    // 尝试更新文档队列为失败状态
    try {
      const body = await request.clone().json().catch(() => ({}));
      const { docId } = body;
      if (docId) {
        const queueRecords = await listBitableRecords(
          env,
          env.FEISHU_BITABLE_APP_TOKEN,
          env.FEISHU_QUEUE_TABLE_ID,
        );
        const matchedRecord = queueRecords.find(
          (record) => record.fields?.doc_id === docId,
        );
        if (matchedRecord) {
          await updateBitableRecord(
            env,
            env.FEISHU_BITABLE_APP_TOKEN,
            env.FEISHU_QUEUE_TABLE_ID,
            matchedRecord.record_id,
            {
              status: '失败',
              error_message: err.message,
              last_processed: new Date().toISOString(),
            },
          );
        }
      }
    } catch (updateErr) {
      console.warn('更新失败状态时出错:', updateErr.message);
    }

    return jsonResponse(
      {
        success: false,
        error: '文档抽取失败',
        message: err.message,
      },
      500,
      corsHeaders(request),
    );
  }
}

/**
 * 处理 GET /api/status - 获取同步状态信息
 * @param {Request} request
 * @param {Object} env
 * @returns {Response}
 */
async function handleStatus(request, env) {
  return jsonResponse(
    {
      status: syncState.lastSyncStatus,
      lastSync: syncState.lastSyncTime || '尚未同步',
      errorMessage: syncState.lastErrorMessage || null,
      cronSchedule: '0 */6 * * *', // 每6小时
      uptime: new Date().toISOString(),
    },
    200,
    corsHeaders(request),
  );
}

// ============================================================================
// 主入口 - Cloudflare Workers fetch 和 scheduled 事件处理
// ============================================================================

export default {
  /**
   * 处理 HTTP 请求
   * 路由分发到对应的处理函数
   * @param {Request} request - 请求对象
   * @param {Object} env - 环境变量
   * @param {ExecutionContext} ctx - 执行上下文
   * @returns {Promise<Response>} 响应对象
   */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // 处理 CORS 预检请求
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request),
      });
    }

    try {
      // 路由分发
      switch (true) {
        // 健康检查
        case pathname === '/api/health' && method === 'GET':
          return handleHealth(request, env);

        // 获取知识图谱数据（前端主接口）
        case pathname === '/api/graph' && method === 'GET':
          return handleGraph(request, env, ctx);

        // 手动触发同步
        case pathname === '/api/sync' && method === 'POST':
          return handleSync(request, env, ctx);

        // 文档知识抽取
        case pathname === '/api/extract' && method === 'POST':
          return handleExtract(request, env, ctx);

        // 同步状态查询
        case pathname === '/api/status' && method === 'GET':
          return handleStatus(request, env);

        // 404 - 未匹配的路由
        default:
          return jsonResponse(
            {
              success: false,
              error: '接口不存在',
              availableEndpoints: [
                'GET  /api/health  - 健康检查',
                'GET  /api/graph   - 获取知识图谱',
                'POST /api/sync    - 手动触发同步',
                'POST /api/extract - 文档知识抽取',
                'GET  /api/status  - 同步状态',
              ],
            },
            404,
            corsHeaders(request),
          );
      }
    } catch (err) {
      // 全局异常捕获，确保始终返回有效的 JSON 响应
      console.error('未处理的请求错误:', err.message);
      return jsonResponse(
        {
          success: false,
          error: '服务器内部错误',
          message: err.message,
        },
        500,
        corsHeaders(request),
      );
    }
  },

  /**
   * 处理定时触发事件（Cron Trigger）
   * 由 wrangler.toml 中配置的 crons 定时调用
   * 默认每6小时执行一次同步
   * @param {ScheduledEvent} event - 定时事件
   * @param {Object} env - 环境变量
   * @param {ExecutionContext} ctx - 执行上下文
   * @returns {Promise<void>}
   */
  async scheduled(event, env, ctx) {
    console.log(`[定时任务] 开始执行定时同步, cron: ${event.cron}, 时间: ${new Date().toISOString()}`);

    try {
      // 更新同步状态
      syncState.lastSyncStatus = 'syncing';

      // 执行同步
      const graphData = await syncFromFeishu(env);

      console.log(
        `[定时任务] 同步完成: ${graphData.nodes.length} 个节点, ${graphData.edges.length} 条关系`,
      );
    } catch (err) {
      console.error(`[定时任务] 同步失败: ${err.message}`);
      syncState.lastSyncStatus = 'error';
      syncState.lastErrorMessage = err.message;
    }
  },
};
