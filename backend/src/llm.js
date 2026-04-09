// LLM 抽取模块 - 从飞书文档中自动抽取知识实体和关系

/**
 * 构建实体和关系抽取的系统提示词
 * @param {Array} categories - 预定义分类列表 [{name, color}]
 * @returns {string} 系统提示词
 */
export function buildExtractionPrompt(categories) {
  const categoryList = categories.map((c) => `- ${c.name}`).join('\n');

  return `你是一个专业的 AI 知识图谱构建助手。你的任务是从给定的文本中抽取 AI 相关的知识实体和实体之间的关系。

## 实体类型
每个实体必须属于以下分类之一：
${categoryList}

## 实体属性
对于每个实体，请提取以下信息：
- name: 实体名称（简洁准确）
- category: 分类名称（必须与上述分类完全匹配）
- description: 实体描述（中文，简洁明了，不超过50字）
- importance: 重要程度（1-5，5最重要）

## 关系类型
实体之间的关系类型包括：
- 包含: A 包含 B（A 是整体，B 是部分）
- 基于: A 基于 B（A 的基础是 B）
- 使用: A 使用 B（A 采用了 B）
- 属于: A 属于 B（A 是 B 的子类或成员）
- 变体: A 是 B 的变体
- 改进: A 改进了 B
- 应用于: A 应用于 B
- 对比: A 与 B 对比
- 组成: A 组成 B
- 相关: A 与 B 相关

## 关系属性
对于每个关系，请提取：
- source: 源实体名称（必须与抽取的实体名称一致）
- target: 目标实体名称（必须与抽取的实体名称一致）
- relation: 关系类型（必须为上述关系类型之一）

## 输出格式
请严格以 JSON 格式输出，不要包含任何 markdown 标记或代码块。格式如下：
{"nodes":[{"name":"实体名","category":"分类名","description":"描述","importance":3}],"edges":[{"source":"源实体","target":"目标实体","relation":"关系类型"}]}

## 注意事项
1. 只抽取与 AI、机器学习、深度学习相关的实体
2. 实体名称要准确、规范，使用业界通用名称
3. 关系的 source 和 target 必须是已抽取的实体名称
4. 如果文本中没有可抽取的实体，返回 {"nodes":[],"edges":[]}
5. 不要输出任何多余的文字说明，只输出 JSON`;
}

/**
 * 将实体名称转换为 URL 安全的 slug 作为唯一 ID
 * @param {string} name - 实体名称
 * @returns {string} slug 格式的 ID
 */
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * 从 LLM 响应内容中提取 JSON 数据
 * 处理 LLM 可能将 JSON 包裹在 markdown 代码块中的情况
 * @param {string} content - LLM 响应的文本内容
 * @returns {object} 解析后的 JSON 对象
 * @throws {Error} 当无法提取有效 JSON 时抛出错误
 */
function extractJSON(content) {
  // 尝试直接解析
  try {
    return JSON.parse(content);
  } catch {
    // 直接解析失败，尝试从 markdown 代码块中提取
  }

  // 尝试匹配 ```json ... ``` 或 ``` ... ``` 代码块
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // 代码块提取失败，继续尝试
    }
  }

  // 尝试匹配第一个 { 到最后一个 } 之间的内容
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } catch {
      // 花括号提取失败
    }
  }

  throw new Error(`无法从 LLM 响应中提取有效 JSON。响应内容: ${content.slice(0, 200)}`);
}

/**
 * 对实体列表进行去重处理
 * 当出现同名实体时，保留重要度更高的那个
 * @param {Array} nodes - 实体节点列表
 * @returns {Array} 去重后的实体节点列表
 */
function deduplicateNodes(nodes) {
  const map = new Map();

  for (const node of nodes) {
    const key = node.name;
    const existing = map.get(key);

    if (!existing || (node.importance || 0) > (existing.importance || 0)) {
      map.set(key, node);
    }
  }

  return Array.from(map.values());
}

/**
 * 从文档文本中抽取知识实体和关系
 * 调用 LLM API（OpenAI 兼容格式）进行智能抽取
 *
 * @param {string} text - 文档文本内容
 * @param {Array} categories - 预定义分类列表 [{name, color}]
 * @param {object} env - Cloudflare Workers env (LLM_API_KEY, LLM_API_BASE)
 * @returns {Promise<object>} { nodes: [...], edges: [...] }
 * @throws {Error} 当 API 调用或解析失败时抛出错误
 */
export async function extractEntitiesAndRelations(text, categories, env) {
  // 检查必要的环境变量
  if (!env.LLM_API_KEY) {
    throw new Error('缺少必要的环境变量 LLM_API_KEY');
  }

  // 构建请求参数
  const apiBase = (env.LLM_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = env.LLM_MODEL || 'gpt-4o-mini';
  const systemPrompt = buildExtractionPrompt(categories);

  // 截断过长的文本，避免超出 token 限制
  const maxTextLength = 12000;
  const truncatedText = text.length > maxTextLength
    ? text.slice(0, maxTextLength) + '\n\n[文本已截断]'
    : text;

  // 调用 LLM API
  let response;
  try {
    response = await fetch(`${apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: truncatedText },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    });
  } catch (err) {
    console.error('LLM API 请求失败:', err);
    throw new Error(`LLM API 请求失败: ${err.message}`);
  }

  // 检查响应状态
  if (!response.ok) {
    const errorBody = await response.text().catch(() => '无法读取错误响应');
    console.error(`LLM API 返回错误: ${response.status}`, errorBody);
    throw new Error(`LLM API 返回错误 ${response.status}: ${errorBody.slice(0, 500)}`);
  }

  // 解析响应
  let responseData;
  try {
    responseData = await response.json();
  } catch (err) {
    console.error('LLM API 响应 JSON 解析失败:', err);
    throw new Error(`LLM API 响应 JSON 解析失败: ${err.message}`);
  }

  // 提取生成的内容
  const content = responseData?.choices?.[0]?.message?.content;
  if (!content) {
    console.error('LLM API 响应格式异常:', JSON.stringify(responseData).slice(0, 500));
    throw new Error('LLM API 响应中未找到有效内容');
  }

  // 解析 JSON
  let result;
  try {
    result = extractJSON(content);
  } catch (err) {
    console.error('JSON 解析失败，原始内容:', content.slice(0, 500));
    throw new Error(`JSON 解析失败: ${err.message}`);
  }

  // 验证数据结构
  if (!result || typeof result !== 'object') {
    throw new Error('LLM 返回的数据不是有效的对象');
  }

  if (!Array.isArray(result.nodes)) {
    result.nodes = [];
  }

  if (!Array.isArray(result.edges)) {
    result.edges = [];
  }

  // 去重实体
  result.nodes = deduplicateNodes(result.nodes);

  // 为每个节点生成唯一 ID
  const idSet = new Set();
  for (const node of result.nodes) {
    let id = slugify(node.name);

    // 处理 slug 冲突
    if (idSet.has(id)) {
      let suffix = 2;
      while (idSet.has(`${id}-${suffix}`)) {
        suffix++;
      }
      id = `${id}-${suffix}`;
    }

    idSet.add(id);
    node.id = id;
  }

  // 构建名称到 ID 的映射，用于规范化边中的 source/target
  const nameToId = new Map();
  for (const node of result.nodes) {
    nameToId.set(node.name, node.id);
  }

  // 过滤无效的边（source 或 target 不在节点列表中）
  const validNodeIds = new Set(nameToId.values());
  result.edges = result.edges
    .filter((edge) => {
      const sourceId = nameToId.get(edge.source);
      const targetId = nameToId.get(edge.target);
      return sourceId && targetId;
    })
    .map((edge) => ({
      source: nameToId.get(edge.source),
      target: nameToId.get(edge.target),
      relation: edge.relation || '相关',
    }));

  // 清理节点属性，确保字段完整
  result.nodes = result.nodes.map((node) => ({
    id: node.id,
    name: node.name || '未命名',
    category: node.category || '概念',
    description: node.description || '',
    importance: Math.min(5, Math.max(1, parseInt(node.importance, 10) || 3)),
  }));

  console.log(`实体抽取完成: ${result.nodes.length} 个实体, ${result.edges.length} 条关系`);

  return result;
}
