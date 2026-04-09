// 图谱数据转换模块 - 将飞书多维表格记录转换为图谱JSON格式

/**
 * 从飞书记录的字段中安全获取值
 * 支持多种字段类型的值提取
 * @param {object} fields - 飞书记录的 fields 对象
 * @param {string} fieldName - 字段名称
 * @returns {string|null} 字段值
 */
function getFieldValue(fields, fieldName) {
  if (!fields || !fieldName) return null;

  const value = fields[fieldName];
  if (value === undefined || value === null) return null;

  // 数组类型（如多选、关联记录），取第一个元素的文本或值
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const first = value[0];
    if (typeof first === 'object' && first !== null) {
      return first.text || first.name || first.id || null;
    }
    return String(first);
  }

  // 对象类型（如超链接）
  if (typeof value === 'object') {
    return value.link || value.text || value.url || null;
  }

  return String(value);
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
 * 转换飞书节点记录为图谱节点格式
 * 从飞书多维表格的记录中提取节点信息，映射为图谱所需的格式
 *
 * @param {Array} records - 飞书多维表格记录列表
 * @returns {Array} 图谱节点数组 [{ id, name, category, description, importance }]
 */
export function transformNodes(records) {
  if (!Array.isArray(records)) return [];

  const nodes = [];
  const idSet = new Set();

  for (const record of records) {
    const fields = record.fields || {};

    // 检查发布状态，跳过未发布的记录
    const status = getFieldValue(fields, '状态') || getFieldValue(fields, 'status');
    if (status && status !== '已发布') {
      continue;
    }

    // 提取节点名称
    const name = getFieldValue(fields, '名称') || getFieldValue(fields, 'name') || getFieldValue(fields, '文本');
    if (!name) continue;

    // 生成节点 ID：优先使用 node_id 字段，否则从名称生成 slug
    let id = getFieldValue(fields, 'node_id') || getFieldValue(fields, 'ID');
    if (!id) {
      id = slugify(name);
    }

    // 处理 ID 冲突
    if (idSet.has(id)) {
      let suffix = 2;
      while (idSet.has(`${id}-${suffix}`)) {
        suffix++;
      }
      id = `${id}-${suffix}`;
    }
    idSet.add(id);

    // 提取分类
    const category = getFieldValue(fields, '分类') || getFieldValue(fields, 'category') || '概念';

    // 提取描述
    const description = getFieldValue(fields, '描述') || getFieldValue(fields, 'description') || '';

    // 提取重要度（默认为 3）
    const importanceRaw = getFieldValue(fields, '重要度') || getFieldValue(fields, 'importance');
    const importance = Math.min(5, Math.max(1, parseInt(importanceRaw, 10) || 3));

    nodes.push({
      id,
      name,
      category,
      description,
      importance,
    });
  }

  return nodes;
}

/**
 * 转换飞书关系记录为图谱边格式
 * 从飞书多维表格的记录中提取关系信息，映射为图谱边
 *
 * @param {Array} records - 飞书多维表格记录列表
 * @param {Set|Array} nodeIds - 有效节点 ID 集合，用于过滤无效边
 * @returns {Array} 图谱边数组 [{ source, target, relation }]
 */
export function transformEdges(records, nodeIds) {
  if (!Array.isArray(records)) return [];

  // 将 nodeIds 转换为 Set 以便快速查找
  const nodeIdSet = nodeIds instanceof Set ? nodeIds : new Set(nodeIds);

  const edges = [];

  for (const record of records) {
    const fields = record.fields || {};

    // 提取源节点和目标节点
    // 支持多种字段命名方式
    let source = getFieldValue(fields, '源节点') || getFieldValue(fields, 'source');
    let target = getFieldValue(fields, '目标节点') || getFieldValue(fields, 'target');

    // 如果字段值为空，尝试从关联字段中提取
    if (!source) {
      const sourceField = fields['源节点'] || fields['source'];
      if (Array.isArray(sourceField) && sourceField.length > 0) {
        source = sourceField[0].text || sourceField[0].name || sourceField[0];
      }
    }

    if (!target) {
      const targetField = fields['目标节点'] || fields['target'];
      if (Array.isArray(targetField) && targetField.length > 0) {
        target = targetField[0].text || targetField[0].name || targetField[0];
      }
    }

    // 如果提取到的是名称而非 ID，尝试通过 slug 匹配
    if (source && !nodeIdSet.has(source)) {
      const slug = slugify(String(source));
      if (nodeIdSet.has(slug)) {
        source = slug;
      }
    }

    if (target && !nodeIdSet.has(target)) {
      const slug = slugify(String(target));
      if (nodeIdSet.has(slug)) {
        target = slug;
      }
    }

    // 跳过源或目标不在节点集合中的边
    if (!source || !target || !nodeIdSet.has(source) || !nodeIdSet.has(target)) {
      continue;
    }

    // 提取关系类型
    const relation = getFieldValue(fields, '关系') || getFieldValue(fields, 'relation') || '相关';

    edges.push({
      source,
      target,
      relation,
    });
  }

  return edges;
}

/**
 * 转换分类记录为图谱分类格式
 * 从飞书多维表格的记录中提取分类信息
 *
 * @param {Array} records - 飞书多维表格记录列表
 * @returns {Array} 分类数组 [{ name, color }]
 */
export function transformCategories(records) {
  if (!Array.isArray(records)) return [];

  const categories = [];
  const nameSet = new Set();

  for (const record of records) {
    const fields = record.fields || {};

    // 提取分类名称
    const name = getFieldValue(fields, '名称') || getFieldValue(fields, 'name');
    if (!name || nameSet.has(name)) continue;

    nameSet.add(name);

    // 提取分类颜色，提供默认颜色
    const color = getFieldValue(fields, '颜色') || getFieldValue(fields, 'color') || '#6366f1';

    categories.push({
      name,
      color,
    });
  }

  return categories;
}

/**
 * 构建完整的图谱数据
 * 整合节点、边和分类数据，生成前端可用的图谱 JSON
 *
 * @param {Array} nodeRecords - 飞书节点记录列表
 * @param {Array} edgeRecords - 飞书关系记录列表
 * @param {Array} categoryRecords - 飞书分类记录列表
 * @returns {object} 完整图谱数据 { nodes, edges, categories }
 */
export function buildGraphData(nodeRecords, edgeRecords, categoryRecords) {
  // 转换分类数据
  const categories = transformCategories(categoryRecords);

  // 转换节点数据
  const nodes = transformNodes(nodeRecords);

  // 构建节点 ID 集合，用于过滤边
  const nodeIds = new Set(nodes.map((n) => n.id));

  // 转换边数据
  const edges = transformEdges(edgeRecords, nodeIds);

  console.log(`图谱数据构建完成: ${nodes.length} 个节点, ${edges.length} 条边, ${categories.length} 个分类`);

  return {
    nodes,
    edges,
    categories,
  };
}

/**
 * 合并动态飞书数据与静态回退数据
 * 以飞书数据为主，用静态数据补充缺失部分
 *
 * @param {object} graphData - 从飞书获取的动态图谱数据 { nodes, edges, categories }
 * @param {object} staticData - 静态回退图谱数据 { nodes, edges, categories }
 * @returns {object} 合并后的图谱数据 { nodes, edges, categories }
 */
export function mergeWithStaticData(graphData, staticData) {
  if (!staticData) return graphData;
  if (!graphData) return staticData;

  // 合并分类（取并集，飞书数据优先）
  const categoryMap = new Map();

  // 先加载静态分类
  if (Array.isArray(staticData.categories)) {
    for (const cat of staticData.categories) {
      if (cat.name) {
        categoryMap.set(cat.name, cat);
      }
    }
  }

  // 用飞书分类覆盖（飞书数据为主）
  if (Array.isArray(graphData.categories)) {
    for (const cat of graphData.categories) {
      if (cat.name) {
        categoryMap.set(cat.name, cat);
      }
    }
  }

  const categories = Array.from(categoryMap.values());

  // 合并节点（飞书数据为主，静态数据补充）
  const nodeMap = new Map();

  // 先加载静态节点
  if (Array.isArray(staticData.nodes)) {
    for (const node of staticData.nodes) {
      const key = node.id || node.name;
      if (key) {
        nodeMap.set(key, node);
      }
    }
  }

  // 用飞书节点覆盖
  if (Array.isArray(graphData.nodes)) {
    for (const node of graphData.nodes) {
      const key = node.id || node.name;
      if (key) {
        nodeMap.set(key, node);
      }
    }
  }

  const nodes = Array.from(nodeMap.values());

  // 构建有效节点 ID 集合
  const validNodeIds = new Set(nodes.map((n) => n.id || n.name));

  // 合并边（只保留源和目标都存在的有效边）
  const edgeSet = new Set();

  // 辅助函数：生成边的唯一键
  const edgeKey = (e) => `${e.source}::${e.target}::${e.relation}`;

  // 先加载静态边
  if (Array.isArray(staticData.edges)) {
    for (const edge of staticData.edges) {
      const src = edge.source;
      const tgt = edge.target;
      if (validNodeIds.has(src) && validNodeIds.has(tgt)) {
        edgeSet.add(edgeKey(edge));
      }
    }
  }

  // 用飞书边覆盖
  if (Array.isArray(graphData.edges)) {
    for (const edge of graphData.edges) {
      const src = edge.source;
      const tgt = edge.target;
      if (validNodeIds.has(src) && validNodeIds.has(tgt)) {
        edgeSet.add(edgeKey(edge));
      }
    }
  }

  // 将边集合转换回数组
  const edges = Array.from(edgeSet).map((key) => {
    const [source, target, relation] = key.split('::');
    return { source, target, relation };
  });

  console.log(`数据合并完成: ${nodes.length} 个节点, ${edges.length} 条边, ${categories.length} 个分类`);

  return {
    nodes,
    edges,
    categories,
  };
}
