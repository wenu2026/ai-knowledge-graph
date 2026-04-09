// LLM 抽取模块 - 从飞书文档中自动抽取知识实体和关系
// 支持分段抽取、表格解析、结果合并

// ============================================================
// 配置常量
// ============================================================
const MAX_SEGMENT_LENGTH = 6000; // 每段最大字符数（约 2000 tokens）
const MIN_SEGMENT_LENGTH = 1000; // 最小分段长度
const MAX_CONCURRENT_CALLS = 3; // 最大并发 LLM 调用数

// ============================================================
// Prompt 模板
// ============================================================

/**
 * 构建实体和关系抽取的系统提示词（针对技术/方法 + 概念/理论类型）
 */
function buildExtractionPrompt(categories) {
  const categoryList = categories.map((c) => `- ${c.name}`).join('\n');

  return `你是一个专业的 AI 知识图谱构建助手。你的任务是从给定的文本中抽取 AI 相关的知识实体和它们之间的关系。

## 实体类型
请重点抽取以下类型的实体：
1. **技术/方法**：算法、模型架构、训练技术、工具框架（如 Transformer、CNN、反向传播、RLHF）
2. **概念/理论**：学术概念、理论流派、核心思想（如 符号主义、连接主义、涌现能力）

## 实体属性
对于每个实体，请提取：
- name: 实体名称（中文优先，保留英文缩写如 "CNN"）
- category: 分类（必须为以下之一）
${categoryList}
- description: 简洁的一句话描述（50-100字，说明该实体的核心特征和作用）
- importance: 重要性评分（1-5）
  - 5: 颠覆性突破，改变整个领域（如 Transformer、ChatGPT）
  - 4: 重要里程碑，广泛影响力（如 ResNet、AlphaGo）
  - 3: 核心技术或概念，有一定影响（如 SVM、GAN）
  - 2: 辅助技术或衍生概念
  - 1: 提及但不重要

## 关系类型
请抽取以下类型的关系：
- 包含: A 包含 B（A 是 B 的父类或容器）
- 基于: A 基于 B（A 采用了 B 的核心技术）
- 使用: A 使用 B（A 在实现中依赖 B）
- 属于: A 属于 B（A 是 B 的子类或成员）
- 变体: A 是 B 的变体
- 改进: A 改进了 B
- 应用于: A 应用于 B
- 对比: A 与 B 对比
- 组成: A 组成 B
- 相关: A 与 B 相关

## 输出格式
请严格以 JSON 格式输出，不要包含任何其他文字：
{
  "nodes": [
    {"name": "实体名", "category": "分类", "description": "描述", "importance": 4}
  ],
  "edges": [
    {"source": "源实体名", "target": "目标实体名", "relation": "关系类型"}
  ]
}

## 注意事项
1. 实体名称要准确，保持原文中的表述
2. 描述要简洁但信息完整，不要简单复制原文
3. 关系要有明确语义，避免模糊的"相关"
4. 如果文本中没有可抽取的实体，返回空数组 {"nodes": [], "edges": []}`;
}

/**
 * 构建表格抽取的专用提示词
 */
function buildTableExtractionPrompt() {
  return `你是一个专业的结构化数据提取助手。请从给定的表格文本中提取所有有价值的实体和关系。

表格通常包含：
- 时间/年份信息
- 技术名称
- 描述/意义
- 人物/机构

## 输出格式
请严格以 JSON 格式输出：
{
  "nodes": [
    {"name": "实体名", "category": "分类", "description": "描述", "importance": 4}
  ],
  "edges": [
    {"source": "源实体名", "target": "目标实体名", "relation": "关系类型"}
  ]
}

## 注意
1. 表格中的每一行都可能包含一个或多个实体
2. 年份可以作为"事件"类型实体抽取（如 "2012年ImageNet突破"）
3. 人物与技术的"提出/发明"关系可以用"相关"或"组成"表示`;
}

// ============================================================
// 文本处理工具函数
// ============================================================

/**
 * 将文本按章节分段
 * 识别 Markdown 标题作为分段边界
 */
function splitBySections(text) {
  const segments = [];
  const lines = text.split('\n');

  let currentSegment = {
    title: '引言',
    content: [],
    level: 0,
  };

  for (const line of lines) {
    // 匹配 Markdown 标题
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      // 保存当前段落（如果有足够内容）
      if (currentSegment.content.join('\n').trim().length >= MIN_SEGMENT_LENGTH) {
        segments.push({
          title: currentSegment.title,
          content: currentSegment.content.join('\n').trim(),
          level: currentSegment.level,
        });
      }

      // 开始新段落
      currentSegment = {
        title: headerMatch[2].trim(),
        content: [],
        level: headerMatch[1].length,
      };
    } else {
      currentSegment.content.push(line);
    }
  }

  // 保存最后一个段落
  const lastContent = currentSegment.content.join('\n').trim();
  if (lastContent.length >= MIN_SEGMENT_LENGTH) {
    segments.push({
      title: currentSegment.title,
      content: lastContent,
      level: currentSegment.level,
    });
  }

  // 如果分段后内容过长，进一步拆分
  const finalSegments = [];
  for (const seg of segments) {
    if (seg.content.length > MAX_SEGMENT_LENGTH) {
      // 按段落进一步拆分
      const paragraphs = seg.content.split(/\n\n+/);
      let buffer = '';

      for (const para of paragraphs) {
        if (buffer.length + para.length > MAX_SEGMENT_LENGTH) {
          if (buffer.trim()) {
            finalSegments.push({
              title: seg.title,
              content: buffer.trim(),
              level: seg.level,
            });
          }
          buffer = para;
        } else {
          buffer += '\n\n' + para;
        }
      }

      if (buffer.trim()) {
        finalSegments.push({
          title: seg.title,
          content: buffer.trim(),
          level: seg.level,
        });
      }
    } else {
      finalSegments.push(seg);
    }
  }

  return finalSegments;
}

/**
 * 从文本中提取表格内容
 * 支持 Markdown 表格格式
 */
function extractTables(text) {
  const tables = [];
  const lines = text.split('\n');
  let currentTable = null;
  let tableContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 检测 Markdown 表格行（包含 |）
    if (line.includes('|') && line.trim().startsWith('|')) {
      if (!currentTable) {
        currentTable = { startLine: i, rows: [] };
        tableContent = [];
      }
      tableContent.push(line);
    } else {
      // 表格结束
      if (currentTable && tableContent.length > 2) {
        // 至少有表头、分隔符和一行数据
        currentTable.content = tableContent.join('\n');
        currentTable.endLine = i - 1;
        tables.push(currentTable);
      }
      currentTable = null;
      tableContent = [];
    }
  }

  // 处理文档末尾的表格
  if (currentTable && tableContent.length > 2) {
    currentTable.content = tableContent.join('\n');
    currentTable.endLine = lines.length - 1;
    tables.push(currentTable);
  }

  return tables;
}

/**
 * 将表格转换为易读的文本格式
 */
function tableToText(tableContent) {
  const lines = tableContent.split('\n').filter((l) => l.trim());

  if (lines.length < 2) return '';

  // 解析表头
  const headers = lines[0]
    .split('|')
    .map((h) => h.trim())
    .filter((h) => h);

  // 跳过分隔行，解析数据行
  const dataLines = lines.slice(2);
  const rows = dataLines.map((line) =>
    line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c)
  );

  // 转换为易读格式
  let text = '【表格数据】\n';
  text += headers.join(' | ') + '\n';
  text += '-'.repeat(50) + '\n';

  for (const row of rows) {
    // 将每行转换为描述性文本
    const rowData = {};
    headers.forEach((h, i) => {
      if (row[i]) rowData[h] = row[i];
    });
    text += Object.entries(rowData)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ') + '\n';
  }

  return text;
}

/**
 * 名称转 slug 格式 ID
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
 * 从 LLM 响应中提取 JSON
 */
function extractJSON(content) {
  // 尝试直接解析
  try {
    return JSON.parse(content);
  } catch {
    // 继续尝试其他方法
  }

  // 尝试从 markdown 代码块提取
  const codeBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // 继续
    }
  }

  // 尝试提取第一个 { } 之间的内容
  const firstBrace = content.indexOf('{');
  const lastBrace = content.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(content.slice(firstBrace, lastBrace + 1));
    } catch {
      // 失败
    }
  }

  throw new Error(`无法从响应中提取有效 JSON: ${content.slice(0, 200)}...`);
}

// ============================================================
// LLM 调用函数
// ============================================================

/**
 * 调用 LLM API 进行单次抽取
 */
async function callLLM(systemPrompt, userContent, env) {
  if (!env.LLM_API_KEY) {
    throw new Error('缺少必要的环境变量 LLM_API_KEY');
  }

  const apiBase = (env.LLM_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = env.LLM_MODEL || 'gpt-4o-mini';

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '无法读取错误响应');
    throw new Error(`LLM API 错误 ${response.status}: ${errorBody.slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('LLM API 响应格式异常');
  }

  return extractJSON(content);
}

/**
 * 对单个文本段进行抽取
 */
async function extractFromSegment(segment, categories, env, segmentIndex, totalSegments) {
  const systemPrompt = buildExtractionPrompt(categories);

  // 在用户内容中添加上下文信息
  const userContent = `【文档片段 ${segmentIndex + 1}/${totalSegments}：${segment.title}】

${segment.content}`;

  console.log(`[LLM] 正在处理片段 ${segmentIndex + 1}/${totalSegments}: ${segment.title}`);

  const result = await callLLM(systemPrompt, userContent, env);

  return {
    segment: segment.title,
    nodes: result.nodes || [],
    edges: result.edges || [],
  };
}

/**
 * 对表格内容进行抽取
 */
async function extractFromTable(tableContent, categories, env, tableIndex) {
  const systemPrompt = buildTableExtractionPrompt();
  const userContent = `请从以下表格中提取实体和关系：

${tableContent}`;

  console.log(`[LLM] 正在处理表格 ${tableIndex + 1}`);

  const result = await callLLM(systemPrompt, userContent, env);

  return {
    segment: `表格 ${tableIndex + 1}`,
    nodes: result.nodes || [],
    edges: result.edges || [],
  };
}

// ============================================================
// 结果合并函数
// ============================================================

/**
 * 合并多次抽取的结果
 * - 实体去重（同名实体保留重要度更高的）
 * - 关系去重
 * - 关系中的实体名称规范化
 */
function mergeResults(results) {
  const nodeMap = new Map(); // name -> node
  const edgeSet = new Set(); // "source|target|relation" 去重

  for (const result of results) {
    // 合并节点
    for (const node of result.nodes) {
      const existing = nodeMap.get(node.name);

      if (!existing) {
        nodeMap.set(node.name, { ...node });
      } else {
        // 保留重要度更高的，合并描述
        if ((node.importance || 0) > (existing.importance || 0)) {
          existing.importance = node.importance;
        }
        if (node.description && (!existing.description || node.description.length > existing.description.length)) {
          existing.description = node.description;
        }
        // 分类：优先选择更具体的分类
        if (node.category && node.category !== '概念' && existing.category === '概念') {
          existing.category = node.category;
        }
      }
    }

    // 合并边
    for (const edge of result.edges) {
      const key = `${edge.source}|${edge.target}|${edge.relation}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
      }
    }
  }

  // 为节点生成 ID
  const nodes = [];
  const nameToId = new Map();
  const idSet = new Set();

  for (const [name, node] of nodeMap) {
    let id = slugify(name);

    // 处理 ID 冲突
    if (idSet.has(id)) {
      let suffix = 2;
      while (idSet.has(`${id}-${suffix}`)) {
        suffix++;
      }
      id = `${id}-${suffix}`;
    }

    idSet.add(id);
    nameToId.set(name, id);

    nodes.push({
      id,
      name: node.name,
      category: node.category || '概念',
      description: node.description || '',
      importance: Math.min(5, Math.max(1, parseInt(node.importance, 10) || 3)),
    });
  }

  // 转换边中的实体名称为 ID，过滤无效边
  const validNodeIds = new Set(nodes.map((n) => n.id));
  const edges = [];

  for (const key of edgeSet) {
    const [sourceName, targetName, relation] = key.split('|');
    const sourceId = nameToId.get(sourceName);
    const targetId = nameToId.get(targetName);

    if (sourceId && targetId && sourceId !== targetId) {
      edges.push({
        source: sourceId,
        target: targetId,
        relation: relation || '相关',
      });
    }
  }

  console.log(`[合并] 总计: ${nodes.length} 个实体, ${edges.length} 条关系`);

  return { nodes, edges };
}

// ============================================================
// 主导出函数
// ============================================================

/**
 * 从文档文本中抽取知识实体和关系（分段抽取 + 表格解析）
 *
 * @param {string} text - 文档文本内容
 * @param {Array} categories - 预定义分类列表 [{name, color}]
 * @param {object} env - Cloudflare Workers env
 * @returns {Promise<object>} { nodes: [...], edges: [...], segments: [...] }
 */
export async function extractEntitiesAndRelations(text, categories, env) {
  console.log(`[抽取] 开始处理文档，总长度: ${text.length} 字符`);

  const results = [];

  // 1. 提取并处理表格
  const tables = extractTables(text);
  console.log(`[抽取] 发现 ${tables.length} 个表格`);

  // 从原文中移除表格内容，避免重复抽取
  let textWithoutTables = text;
  for (const table of tables.reverse()) {
    // 从后往前移除，避免位置偏移
    const lines = textWithoutTables.split('\n');
    textWithoutTables = [...lines.slice(0, table.startLine), ...lines.slice(table.endLine + 1)].join('\n');
  }

  // 2. 按章节分段
  const segments = splitBySections(textWithoutTables);
  console.log(`[抽取] 分为 ${segments.length} 个文本段`);

  // 3. 并发调用 LLM（限制并发数）
  const allTasks = [];

  // 添加文本段任务
  for (let i = 0; i < segments.length; i++) {
    allTasks.push({
      type: 'segment',
      index: i,
      total: segments.length,
      data: segments[i],
    });
  }

  // 添加表格任务
  for (let i = 0; i < tables.length; i++) {
    allTasks.push({
      type: 'table',
      index: i,
      total: tables.length,
      data: tableToText(tables[i].content),
    });
  }

  // 分批执行（限制并发）
  for (let i = 0; i < allTasks.length; i += MAX_CONCURRENT_CALLS) {
    const batch = allTasks.slice(i, i + MAX_CONCURRENT_CALLS);

    const batchResults = await Promise.all(
      batch.map((task) => {
        if (task.type === 'segment') {
          return extractFromSegment(task.data, categories, env, task.index, task.total);
        } else {
          return extractFromTable(task.data, categories, env, task.index);
        }
      })
    );

    results.push(...batchResults);
  }

  // 4. 合并结果
  const { nodes, edges } = mergeResults(results);

  // 5. 返回结果（包含分段信息用于调试）
  return {
    nodes,
    edges,
    meta: {
      totalSegments: segments.length,
      totalTables: tables.length,
      segmentResults: results.map((r) => ({
        segment: r.segment,
        nodeCount: r.nodes.length,
        edgeCount: r.edges.length,
      })),
    },
  };
}

/**
 * 构建抽取提示词（导出供外部使用）
 */
export function buildExtractionPrompt(categories) {
  return buildExtractionPrompt(categories);
}
