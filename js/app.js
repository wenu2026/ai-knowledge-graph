/* ============================================================
   AI 知识图谱 - 主应用程序脚本
   ============================================================
   功能模块：
   1. 数据管理（加载、合并、保存、导出、重置）
   2. D3.js 力导向图可视化
   3. 搜索过滤
   4. 分类筛选
   5. 节点详情面板
   6. 添加/编辑/删除节点
   7. 添加关系
   8. UI 交互（Toast、缩放、快捷键等）
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // 常量与配置
  // ============================================================
  const STORAGE_KEY = 'ai-kg-data';
  const DATA_URL = 'data/knowledge.json';
  // 后端 API 地址（Cloudflare Workers）
  const API_URL = 'https://ai-knowledge-graph-api.wendudu2025.workers.dev/api/graph';
  const USE_API = true; // 从后端 API 加载飞书数据
  const DEBOUNCE_DELAY = 250;
  const TOAST_DURATION = 3000;
  const MIN_IMPORTANCE = 3;
  const MAX_IMPORTANCE = 5;
  const MIN_RADIUS = 12;
  const MAX_RADIUS = 28;

  // 力模拟参数（针对 200+ 节点优化）
  const FORCE_CONFIG = {
    linkDistance: 100,
    linkStrength: 0.4,
    chargeStrength: -300,
    chargeDistanceMax: 600,
    collideRadius: 8,
    centerStrength: 0.05,
    alphaDecay: 0.02,
    velocityDecay: 0.3
  };

  // ============================================================
  // 应用状态
  // ============================================================
  const state = {
    originalData: null,    // 原始加载数据
    nodes: [],             // 当前节点列表
    edges: [],             // 当前边列表
    categories: [],        // 分类列表
    simulation: null,      // D3 力模拟
    svg: null,             // D3 SVG 选择集
    g: null,               // SVG 主容器（用于缩放平移）
    zoom: null,            // D3 缩放行为
    linkGroup: null,       // 边容器
    nodeGroup: null,       // 节点容器
    edgeLabelGroup: null,  // 边标签容器
    selectedNode: null,    // 当前选中的节点
    hoveredNode: null,     // 当前悬停的节点
    activeCategories: new Set(), // 激活的分类
    searchQuery: '',       // 搜索关键词
    isDragging: false,     // 是否正在拖拽
    nodeIdCounter: 0       // 节点 ID 计数器
  };

  // ============================================================
  // DOM 元素引用
  // ============================================================
  const dom = {};

  function cacheDomElements() {
    // 搜索
    dom.searchInput = document.getElementById('searchInput');
    dom.searchClear = document.getElementById('searchClear');

    // 分类筛选
    dom.categoryList = document.getElementById('categoryList');
    dom.selectAll = document.getElementById('selectAll');
    dom.totalCount = document.getElementById('totalCount');

    // 统计
    dom.nodeCount = document.getElementById('nodeCount');
    dom.edgeCount = document.getElementById('edgeCount');
    dom.categoryCount = document.getElementById('categoryCount');
    dom.visibleCount = document.getElementById('visibleCount');

    // 操作按钮
    dom.btnAddNode = document.getElementById('btnAddNode');
    dom.btnAddEdge = document.getElementById('btnAddEdge');
    dom.btnExport = document.getElementById('btnExport');
    dom.btnReset = document.getElementById('btnReset');

    // 图谱
    dom.graphSvg = document.getElementById('graphSvg');
    dom.graphContainer = document.getElementById('graphContainer');
    dom.graphLoading = document.getElementById('graphLoading');
    dom.graphEmpty = document.getElementById('graphEmpty');

    // 缩放控制
    dom.zoomIn = document.getElementById('zoomIn');
    dom.zoomOut = document.getElementById('zoomOut');
    dom.zoomReset = document.getElementById('zoomReset');

    // 图例
    dom.legendItems = document.getElementById('legendItems');

    // 详情面板
    dom.detailPanel = document.getElementById('detailPanel');
    dom.detailClose = document.getElementById('detailClose');
    dom.detailNodeName = document.getElementById('detailNodeName');
    dom.detailCategoryBadge = document.getElementById('detailCategoryBadge');
    dom.detailImportance = document.getElementById('detailImportance');
    dom.detailDescription = document.getElementById('detailDescription');
    dom.connectionList = document.getElementById('connectionList');
    dom.connectionCount = document.getElementById('connectionCount');
    dom.detailEditBtn = document.getElementById('detailEditBtn');
    dom.detailDeleteBtn = document.getElementById('detailDeleteBtn');

    // 节点模态框
    dom.nodeModal = document.getElementById('nodeModal');
    dom.nodeModalTitle = document.getElementById('nodeModalTitle');
    dom.nodeModalClose = document.getElementById('nodeModalClose');
    dom.nodeModalCancel = document.getElementById('nodeModalCancel');
    dom.nodeModalConfirm = document.getElementById('nodeModalConfirm');
    dom.nodeForm = document.getElementById('nodeForm');
    dom.nodeEditId = document.getElementById('nodeEditId');
    dom.nodeName = document.getElementById('nodeName');
    dom.nodeCategory = document.getElementById('nodeCategory');
    dom.nodeDescription = document.getElementById('nodeDescription');
    dom.nodeImportance = document.getElementById('nodeImportance');
    dom.importanceSelector = document.getElementById('importanceSelector');
    dom.nodeNameError = document.getElementById('nodeNameError');
    dom.nodeCategoryError = document.getElementById('nodeCategoryError');
    dom.nodeDescHint = document.getElementById('nodeDescHint');

    // 边模态框
    dom.edgeModal = document.getElementById('edgeModal');
    dom.edgeModalClose = document.getElementById('edgeModalClose');
    dom.edgeModalCancel = document.getElementById('edgeModalCancel');
    dom.edgeModalConfirm = document.getElementById('edgeModalConfirm');
    dom.edgeForm = document.getElementById('edgeForm');
    dom.edgeSource = document.getElementById('edgeSource');
    dom.edgeTarget = document.getElementById('edgeTarget');
    dom.edgeRelation = document.getElementById('edgeRelation');
    dom.edgeSourceError = document.getElementById('edgeSourceError');
    dom.edgeTargetError = document.getElementById('edgeTargetError');
    dom.edgeRelationError = document.getElementById('edgeRelationError');

    // 确认对话框
    dom.confirmModal = document.getElementById('confirmModal');
    dom.confirmModalClose = document.getElementById('confirmModalClose');
    dom.confirmCancel = document.getElementById('confirmCancel');
    dom.confirmOk = document.getElementById('confirmOk');
    dom.confirmMessage = document.getElementById('confirmMessage');

    // 帮助模态框
    dom.helpModal = document.getElementById('helpModal');
    dom.helpModalClose = document.getElementById('helpModalClose');
    dom.helpModalOk = document.getElementById('helpModalOk');

    // Toast
    dom.toastContainer = document.getElementById('toastContainer');

    // 头部按钮
    dom.btnHelp = document.getElementById('btnHelp');
    dom.btnFullscreen = document.getElementById('btnFullscreen');

    // 侧边栏
    dom.sidebar = document.getElementById('sidebar');
    dom.categoryToggle = document.getElementById('categoryToggle');
  }

  // ============================================================
  // 工具函数
  // ============================================================

  /**
   * 根据重要性计算节点半径
   */
  function getRadius(importance) {
    const imp = Math.max(MIN_IMPORTANCE, Math.min(MAX_IMPORTANCE, importance || 3));
    return MIN_RADIUS + ((imp - MIN_IMPORTANCE) / (MAX_IMPORTANCE - MIN_IMPORTANCE)) * (MAX_RADIUS - MIN_RADIUS);
  }

  /**
   * 根据分类名称获取颜色
   */
  function getCategoryColor(categoryName) {
    const cat = state.categories.find(c => c.name === categoryName);
    return cat ? cat.color : '#6366f1';
  }

  /**
   * 生成唯一 ID
   */
  function generateId(name) {
    state.nodeIdCounter++;
    const base = name
      ? name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '_').substring(0, 20)
      : 'node';
    return `${base}_${Date.now()}_${state.nodeIdCounter}`;
  }

  /**
   * 防抖函数
   */
  function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  /**
   * 获取节点在图谱数据中的连接边
   */
  function getConnectedEdges(nodeId) {
    return state.edges.filter(e => e.source === nodeId || e.target === nodeId ||
      (typeof e.source === 'object' && e.source.id === nodeId) ||
      (typeof e.target === 'object' && e.target.id === nodeId));
  }

  /**
   * 获取与某节点直接相连的节点列表
   */
  function getConnectedNodes(nodeId) {
    const connections = [];
    state.edges.forEach(e => {
      const srcId = typeof e.source === 'object' ? e.source.id : e.source;
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
      if (srcId === nodeId) {
        const node = state.nodes.find(n => n.id === tgtId);
        if (node) connections.push({ node, relation: e.relation, direction: 'out' });
      } else if (tgtId === nodeId) {
        const node = state.nodes.find(n => n.id === srcId);
        if (node) connections.push({ node, relation: e.relation, direction: 'in' });
      }
    });
    return connections;
  }

  /**
   * 判断节点是否可见（分类筛选 + 搜索匹配）
   */
  function isNodeVisible(node) {
    // 分类筛选
    if (!state.activeCategories.has(node.category)) return false;
    // 搜索过滤
    if (state.searchQuery) {
      return node.name.toLowerCase().includes(state.searchQuery.toLowerCase());
    }
    return true;
  }

  /**
   * 计算当前可见节点数
   */
  function getVisibleNodeCount() {
    return state.nodes.filter(n => isNodeVisible(n)).length;
  }

  // ============================================================
  // Toast 通知系统
  // ============================================================

  function showToast(type, title, message) {
    const iconMap = {
      success: 'fa-check-circle',
      error: 'fa-times-circle',
      warning: 'fa-exclamation-circle',
      info: 'fa-info-circle'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-icon">
        <i class="fas ${iconMap[type] || iconMap.info}"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message || ''}</div>
      </div>
      <button class="toast-close" onclick="this.parentElement.classList.add('removing'); setTimeout(() => this.parentElement.remove(), 300);">
        <i class="fas fa-times"></i>
      </button>
      <div class="toast-progress" style="width: 100%;"></div>
    `;

    dom.toastContainer.appendChild(toast);

    // 触发动画
    requestAnimationFrame(() => {
      toast.classList.add('show');
      // 进度条动画
      const progress = toast.querySelector('.toast-progress');
      if (progress) {
        progress.style.transitionDuration = TOAST_DURATION + 'ms';
        requestAnimationFrame(() => {
          progress.style.width = '0%';
        });
      }
    });

    // 自动移除
    setTimeout(() => {
      toast.classList.remove('show');
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 400);
    }, TOAST_DURATION);
  }

  // ============================================================
  // 数据管理
  // ============================================================

  /**
   * 从 JSON 文件或后端 API 加载数据
   * 当 USE_API 为 true 时，优先从后端 API 获取最新数据
   * API 不可用时自动回退到本地静态 JSON 文件
   */
  async function loadData() {
    dom.graphLoading.style.display = 'flex';

    try {
      let data;

      if (USE_API) {
        // 尝试从后端 API 加载
        try {
          const response = await fetch(API_URL);
          if (response.ok) {
            data = await response.json();
            console.log('[KG] 从后端 API 加载数据成功');
          } else {
            throw new Error(`API 返回 ${response.status}`);
          }
        } catch (apiError) {
          console.warn('[KG] API 加载失败，回退到本地数据:', apiError.message);
          // 回退到本地 JSON
          const fallback = await fetch(DATA_URL);
          data = await fallback.json();
        }
      } else {
        // 从本地 JSON 文件加载
        const response = await fetch(DATA_URL);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        data = await response.json();
      }
      state.originalData = JSON.parse(JSON.stringify(data));

      // 尝试从 localStorage 合并数据
      mergeWithLocalStorage(data);

      // 初始化应用状态
      state.nodes = data.nodes || [];
      state.edges = data.edges || [];
      state.categories = data.categories || [];

      // 初始化激活的分类（全部选中）
      state.activeCategories = new Set(state.categories.map(c => c.name));

      // 初始化 ID 计数器
      state.nodeIdCounter = state.nodes.length;

      // 初始化图谱
      initGraph();
      updateStats();
      buildCategoryFilters();
      buildLegend();
      populateNodeCategoryDropdown();

      showToast('success', '加载成功', `已加载 ${state.nodes.length} 个知识点和 ${state.edges.length} 条关系`);
    } catch (error) {
      console.error('加载数据失败:', error);
      showToast('error', '加载失败', '无法加载知识图谱数据，请检查网络连接');
    } finally {
      dom.graphLoading.classList.add('hidden');
      setTimeout(() => {
        dom.graphLoading.style.display = 'none';
      }, 500);
    }
  }

  /**
   * 合并 localStorage 中保存的数据
   */
  function mergeWithLocalStorage(data) {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const savedData = JSON.parse(saved);

      // 合并节点：以 savedData 为准，新增的节点保留
      if (savedData.nodes && savedData.nodes.length > 0) {
        const originalIds = new Set((data.nodes || []).map(n => n.id));
        savedData.nodes.forEach(node => {
          const idx = data.nodes.findIndex(n => n.id === node.id);
          if (idx >= 0) {
            // 更新已有节点
            data.nodes[idx] = { ...data.nodes[idx], ...node };
          } else {
            // 新增节点
            data.nodes.push(node);
          }
        });
      }

      // 合并边
      if (savedData.edges && savedData.edges.length > 0) {
        const originalEdgeSet = new Set(
          (data.edges || []).map(e => `${e.source}-${e.target}-${e.relation}`)
        );
        savedData.edges.forEach(edge => {
          const key = `${edge.source}-${edge.target}-${edge.relation}`;
          if (!originalEdgeSet.has(key)) {
            data.edges.push(edge);
          }
        });
      }

      // 合并分类
      if (savedData.categories && savedData.categories.length > 0) {
        const originalCatNames = new Set((data.categories || []).map(c => c.name));
        savedData.categories.forEach(cat => {
          if (!originalCatNames.has(cat.name)) {
            data.categories.push(cat);
          }
        });
      }
    } catch (e) {
      console.warn('合并 localStorage 数据失败:', e);
    }
  }

  /**
   * 保存数据到 localStorage
   */
  function saveToLocalStorage() {
    try {
      const data = {
        nodes: state.nodes,
        edges: state.edges,
        categories: state.categories
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('保存到 localStorage 失败:', e);
    }
  }

  /**
   * 导出数据为 JSON 文件
   */
  function exportData() {
    const data = {
      nodes: state.nodes,
      edges: state.edges.map(e => ({
        source: typeof e.source === 'object' ? e.source.id : e.source,
        target: typeof e.target === 'object' ? e.target.id : e.target,
        relation: e.relation
      })),
      categories: state.categories
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-knowledge-graph_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('success', '导出成功', '知识图谱数据已导出为 JSON 文件');
  }

  /**
   * 重置数据到初始状态
   */
  function resetData() {
    showConfirm('确定要重置所有数据吗？这将恢复到初始状态，所有添加和修改的内容将丢失。', () => {
      localStorage.removeItem(STORAGE_KEY);
      state.nodes = JSON.parse(JSON.stringify(state.originalData.nodes));
      state.edges = JSON.parse(JSON.stringify(state.originalData.edges));
      state.categories = JSON.parse(JSON.stringify(state.originalData.categories));
      state.activeCategories = new Set(state.categories.map(c => c.name));
      state.selectedNode = null;
      state.searchQuery = '';
      dom.searchInput.value = '';
      dom.searchClear.classList.remove('visible');

      closeDetailPanel();
      rebuildGraph();
      updateStats();
      buildCategoryFilters();
      buildLegend();
      populateNodeCategoryDropdown();

      showToast('info', '已重置', '数据已恢复到初始状态');
    });
  }

  // ============================================================
  // D3.js 力导向图
  // ============================================================

  /**
   * 初始化图谱
   */
  function initGraph() {
    const container = dom.graphContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 创建 SVG
    state.svg = d3.select('#graphSvg')
      .attr('width', width)
      .attr('height', height);

    // 添加箭头标记定义
    const defs = state.svg.append('defs');

    // 箭头标记
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#4a5568');

    // 高亮箭头
    defs.append('marker')
      .attr('id', 'arrowhead-highlight')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('markerWidth', 8)
      .attr('markerHeight', 8)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#818cf8');

    // 发光滤镜
    const filter = defs.append('filter')
      .attr('id', 'glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    filter.append('feGaussianBlur')
      .attr('stdDeviation', '3')
      .attr('result', 'coloredBlur');
    const feMerge = filter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // 主容器（用于缩放平移）
    state.g = state.svg.append('g').attr('class', 'graph-main-group');

    // 边标签容器（在边之上，节点之下）
    state.edgeLabelGroup = state.g.append('g').attr('class', 'edge-labels');

    // 边容器
    state.linkGroup = state.g.append('g').attr('class', 'links');

    // 节点容器（在最上层）
    state.nodeGroup = state.g.append('g').attr('class', 'nodes');

    // 初始化缩放行为
    state.zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        state.g.attr('transform', event.transform);
      });

    state.svg.call(state.zoom);

    // 点击空白处取消选中
    state.svg.on('click', (event) => {
      if (event.target === state.svg.node() || event.target.tagName === 'svg') {
        deselectNode();
      }
    });

    // 创建力模拟
    createSimulation(width, height);

    // 渲染图谱
    renderGraph();

    // 窗口大小变化
    window.addEventListener('resize', debounce(handleResize, 200));
  }

  /**
   * 创建力模拟
   */
  function createSimulation(width, height) {
    if (state.simulation) {
      state.simulation.stop();
    }

    const nodeCount = state.nodes.length;
    // 根据节点数量调整力参数
    const chargeStrength = nodeCount > 200 ? -150 : nodeCount > 100 ? -250 : FORCE_CONFIG.chargeStrength;
    const linkDistance = nodeCount > 200 ? 60 : nodeCount > 100 ? 80 : FORCE_CONFIG.linkDistance;

    state.simulation = d3.forceSimulation(state.nodes)
      .force('link', d3.forceLink(state.edges)
        .id(d => d.id)
        .distance(linkDistance)
        .strength(FORCE_CONFIG.linkStrength))
      .force('charge', d3.forceManyBody()
        .strength(chargeStrength)
        .distanceMax(FORCE_CONFIG.chargeDistanceMax))
      .force('center', d3.forceCenter(width / 2, height / 2)
        .strength(FORCE_CONFIG.centerStrength))
      .force('collide', d3.forceCollide()
        .radius(d => getRadius(d.importance) + FORCE_CONFIG.collideRadius)
        .strength(0.8))
      .force('x', d3.forceX(width / 2).strength(0.03))
      .force('y', d3.forceY(height / 2).strength(0.03))
      .alphaDecay(FORCE_CONFIG.alphaDecay)
      .velocityDecay(FORCE_CONFIG.velocityDecay)
      .on('tick', ticked);
  }

  /**
   * 渲染图谱元素
   */
  function renderGraph() {
    // ---- 渲染边 ----
    const links = state.linkGroup.selectAll('.graph-edge')
      .data(state.edges, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.relation}`);

    // 退出
    links.exit()
      .transition()
      .duration(300)
      .attr('opacity', 0)
      .remove();

    // 进入
    const linksEnter = links.enter()
      .append('path')
      .attr('class', 'graph-edge')
      .attr('marker-end', 'url(#arrowhead)')
      .attr('opacity', 0);

    linksEnter.transition()
      .duration(500)
      .attr('opacity', 0.5);

    // 合并
    const linksUpdate = linksEnter.merge(links);

    // ---- 渲染边标签 ----
    const edgeLabels = state.edgeLabelGroup.selectAll('.graph-edge-label')
      .data(state.edges, d => `${d.source.id || d.source}-${d.target.id || d.target}-${d.relation}`);

    edgeLabels.exit().remove();

    const edgeLabelsEnter = edgeLabels.enter()
      .append('text')
      .attr('class', 'graph-edge-label')
      .attr('text-anchor', 'middle')
      .attr('dy', -4);

    edgeLabelsEnter.merge(edgeLabels)
      .text(d => d.relation || '');

    // ---- 渲染节点 ----
    const nodes = state.nodeGroup.selectAll('.graph-node')
      .data(state.nodes, d => d.id);

    // 退出
    nodes.exit()
      .transition()
      .duration(300)
      .attr('opacity', 0)
      .attr('transform', d => `translate(${d.x},${d.y}) scale(0)`)
      .remove();

    // 进入
    const nodesEnter = nodes.enter()
      .append('g')
      .attr('class', 'graph-node')
      .attr('data-id', d => d.id)
      .attr('data-importance', d => d.importance)
      .style('opacity', 0)
      .call(d3.drag()
        .on('start', onDragStart)
        .on('drag', onDrag)
        .on('end', onDragEnd));

    // 节点圆形
    nodesEnter.append('circle')
      .attr('class', 'graph-node-circle')
      .attr('r', 0);

    // 节点标签
    nodesEnter.append('text')
      .attr('class', 'graph-node-label')
      .attr('dy', d => getRadius(d.importance) + 14)
      .text(d => d.name);

    // 入场动画
    nodesEnter.transition()
      .duration(500)
      .style('opacity', 1);

    nodesEnter.select('.graph-node-circle')
      .transition()
      .duration(500)
      .attr('r', d => getRadius(d.importance));

    // 合并
    const nodesUpdate = nodesEnter.merge(nodes);

    // 更新节点属性
    nodesUpdate.select('.graph-node-circle')
      .attr('fill', d => getCategoryColor(d.category))
      .attr('r', d => getRadius(d.importance));

    nodesUpdate.select('.graph-node-label')
      .text(d => d.name);

    nodesUpdate
      .attr('data-importance', d => d.importance)
      .attr('data-id', d => d.id);

    // 事件绑定
    nodesUpdate
      .on('mouseenter', onNodeMouseEnter)
      .on('mouseleave', onNodeMouseLeave)
      .on('click', onNodeClick);

    // 应用当前过滤状态
    applyFilters();

    // 重新启动模拟
    if (state.simulation) {
      state.simulation.nodes(state.nodes);
      state.simulation.force('link').links(state.edges);
      state.simulation.alpha(0.3).restart();
    }
  }

  /**
   * Tick 回调 - 更新元素位置
   */
  function ticked() {
    // 更新边路径（曲线）
    state.linkGroup.selectAll('.graph-edge')
      .attr('d', d => {
        const dx = (d.target.x || 0) - (d.source.x || 0);
        const dy = (d.target.y || 0) - (d.source.y || 0);
        const dr = Math.sqrt(dx * dx + dy * dy) * 1.2;
        // 使用二次贝塞尔曲线
        const mx = ((d.source.x || 0) + (d.target.x || 0)) / 2;
        const my = ((d.source.y || 0) + (d.target.y || 0)) / 2;
        // 偏移控制点使曲线弯曲
        const offset = Math.min(dr * 0.15, 30);
        const nx = -dy / (dr || 1) * offset;
        const ny = dx / (dr || 1) * offset;
        return `M${d.source.x || 0},${d.source.y || 0} Q${mx + nx},${my + ny} ${d.target.x || 0},${d.target.y || 0}`;
      });

    // 更新边标签位置
    state.edgeLabelGroup.selectAll('.graph-edge-label')
      .attr('x', d => {
        const mx = ((d.source.x || 0) + (d.target.x || 0)) / 2;
        const dx = (d.target.x || 0) - (d.source.x || 0);
        const dy = (d.target.y || 0) - (d.source.y || 0);
        const dr = Math.sqrt(dx * dx + dy * dy) || 1;
        const offset = Math.min(dr * 0.15, 30);
        return mx + (-dy / dr) * offset;
      })
      .attr('y', d => {
        const my = ((d.source.y || 0) + (d.target.y || 0)) / 2;
        const dx = (d.target.x || 0) - (d.source.x || 0);
        const dy = (d.target.y || 0) - (d.source.y || 0);
        const dr = Math.sqrt(dx * dx + dy * dy) || 1;
        const offset = Math.min(dr * 0.15, 30);
        return my + (dx / dr) * offset;
      });

    // 更新节点位置
    state.nodeGroup.selectAll('.graph-node')
      .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);

    // 控制标签显示：重要性 >= 4 或悬停/选中时显示
    state.nodeGroup.selectAll('.graph-node').each(function (d) {
      const label = d3.select(this).select('.graph-node-label');
      const shouldShow = d.importance >= 4 ||
        state.hoveredNode === d ||
        state.selectedNode === d;
      label.style('display', shouldShow ? 'block' : 'none');
    });
  }

  /**
   * 完全重建图谱
   */
  function rebuildGraph() {
    if (state.simulation) {
      state.simulation.stop();
    }

    // 清空 SVG 内容
    state.g.selectAll('*').remove();

    // 重新创建容器
    state.edgeLabelGroup = state.g.append('g').attr('class', 'edge-labels');
    state.linkGroup = state.g.append('g').attr('class', 'links');
    state.nodeGroup = state.g.append('g').attr('class', 'nodes');

    // 重新创建模拟
    const container = dom.graphContainer;
    createSimulation(container.clientWidth, container.clientHeight);

    // 重新渲染
    renderGraph();
  }

  /**
   * 窗口大小变化处理
   */
  function handleResize() {
    const container = dom.graphContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;

    state.svg.attr('width', width).attr('height', height);

    if (state.simulation) {
      state.simulation.force('center', d3.forceCenter(width / 2, height / 2));
      state.simulation.force('x', d3.forceX(width / 2).strength(0.03));
      state.simulation.force('y', d3.forceY(height / 2).strength(0.03));
      state.simulation.alpha(0.1).restart();
    }
  }

  // ============================================================
  // 节点交互事件
  // ============================================================

  /**
   * 节点鼠标进入
   */
  function onNodeMouseEnter(event, d) {
    if (state.isDragging) return;
    state.hoveredNode = d;

    // 高亮当前节点及其连接
    const connectedNodeIds = new Set();
    connectedNodeIds.add(d.id);

    state.edges.forEach(e => {
      const srcId = typeof e.source === 'object' ? e.source.id : e.source;
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
      if (srcId === d.id) connectedNodeIds.add(tgtId);
      if (tgtId === d.id) connectedNodeIds.add(srcId);
    });

    // 高亮节点
    state.nodeGroup.selectAll('.graph-node')
      .classed('dimmed', node => !connectedNodeIds.has(node.id))
      .classed('highlighted', node => node.id !== d.id && connectedNodeIds.has(node.id));

    // 高亮边
    state.linkGroup.selectAll('.graph-edge')
      .classed('dimmed', e => {
        const srcId = typeof e.source === 'object' ? e.source.id : e.source;
        const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
        return srcId !== d.id && tgtId !== d.id;
      })
      .classed('highlighted', e => {
        const srcId = typeof e.source === 'object' ? e.source.id : e.source;
        const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
        return srcId === d.id || tgtId === d.id;
      })
      .attr('marker-end', function (e) {
        const srcId = typeof e.source === 'object' ? e.source.id : e.source;
        const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
        return (srcId === d.id || tgtId === d.id) ? 'url(#arrowhead-highlight)' : 'url(#arrowhead)';
      });

    // 高亮边标签
    state.edgeLabelGroup.selectAll('.graph-edge-label')
      .classed('highlighted', e => {
        const srcId = typeof e.source === 'object' ? e.source.id : e.source;
        const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
        return srcId === d.id || tgtId === d.id;
      });

    // 显示标签
    state.nodeGroup.selectAll('.graph-node').each(function (node) {
      const label = d3.select(this).select('.graph-node-label');
      const shouldShow = node.importance >= 4 ||
        connectedNodeIds.has(node.id) ||
        state.selectedNode === node;
      label.style('display', shouldShow ? 'block' : 'none');
    });
  }

  /**
   * 节点鼠标离开
   */
  function onNodeMouseLeave(event, d) {
    if (state.isDragging) return;
    state.hoveredNode = null;

    // 移除高亮
    state.nodeGroup.selectAll('.graph-node')
      .classed('dimmed', false)
      .classed('highlighted', false);

    state.linkGroup.selectAll('.graph-edge')
      .classed('dimmed', false)
      .classed('highlighted', false)
      .attr('marker-end', 'url(#arrowhead)');

    state.edgeLabelGroup.selectAll('.graph-edge-label')
      .classed('highlighted', false);

    // 重新应用过滤状态
    applyFilters();
  }

  /**
   * 节点点击
   */
  function onNodeClick(event, d) {
    event.stopPropagation();
    selectNode(d);
  }

  /**
   * 选中节点
   */
  function selectNode(node) {
    // 取消之前的选中
    state.nodeGroup.selectAll('.graph-node').classed('selected', false);

    state.selectedNode = node;
    state.nodeGroup.selectAll(`.graph-node[data-id="${node.id}"]`)
      .classed('selected', true);

    showDetailPanel(node);
  }

  /**
   * 取消选中节点
   */
  function deselectNode() {
    state.nodeGroup.selectAll('.graph-node').classed('selected', false);
    state.selectedNode = null;
    closeDetailPanel();
  }

  // ============================================================
  // 拖拽事件
  // ============================================================

  function onDragStart(event, d) {
    if (!event.active) state.simulation.alphaTarget(0.3).restart();
    state.isDragging = true;
    d.fx = d.x;
    d.fy = d.y;
    d3.select(this).raise();
  }

  function onDrag(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function onDragEnd(event, d) {
    if (!event.active) state.simulation.alphaTarget(0);
    state.isDragging = false;
    // 如果不是固定模式，释放固定
    if (!event.active) {
      d.fx = null;
      d.fy = null;
    }
  }

  // ============================================================
  // 搜索功能
  // ============================================================

  function handleSearch() {
    const query = dom.searchInput.value.trim();
    state.searchQuery = query;

    // 更新清除按钮显示
    if (query) {
      dom.searchClear.classList.add('visible');
    } else {
      dom.searchClear.classList.remove('visible');
    }

    applyFilters();
    updateStats();

    // 空状态提示
    const visibleCount = getVisibleNodeCount();
    if (query && visibleCount === 0) {
      dom.graphEmpty.style.display = 'flex';
    } else {
      dom.graphEmpty.style.display = 'none';
    }
  }

  function clearSearch() {
    dom.searchInput.value = '';
    state.searchQuery = '';
    dom.searchClear.classList.remove('visible');
    applyFilters();
    updateStats();
    dom.graphEmpty.style.display = 'none';
  }

  // ============================================================
  // 分类筛选
  // ============================================================

  /**
   * 构建分类复选框列表
   */
  function buildCategoryFilters() {
    // 移除动态生成的分类项（保留"全部分类"）
    dom.categoryList.querySelectorAll('.category-item:not(.category-item-all)').forEach(el => el.remove());

    state.categories.forEach(cat => {
      const count = state.nodes.filter(n => n.category === cat.name).length;
      const label = document.createElement('label');
      label.className = 'category-item';
      label.innerHTML = `
        <input type="checkbox" value="${cat.name}" checked>
        <span class="category-color" style="background: ${cat.color};"></span>
        <span class="category-name">${cat.name}</span>
        <span class="category-count">${count}</span>
      `;

      const checkbox = label.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          state.activeCategories.add(cat.name);
        } else {
          state.activeCategories.delete(cat.name);
        }
        updateSelectAllState();
        applyFilters();
        updateStats();
      });

      dom.categoryList.appendChild(label);
    });

    // 更新总数
    dom.totalCount.textContent = state.nodes.length;
    updateSelectAllState();
  }

  /**
   * 更新"全选"复选框状态
   */
  function updateSelectAllState() {
    const allChecked = state.activeCategories.size === state.categories.length;
    dom.selectAll.checked = allChecked;
  }

  /**
   * 全选/取消全选
   */
  function handleSelectAll() {
    const checked = dom.selectAll.checked;
    state.activeCategories.clear();

    if (checked) {
      state.categories.forEach(c => state.activeCategories.add(c.name));
    }

    // 更新所有分类复选框
    dom.categoryList.querySelectorAll('.category-item:not(.category-item-all) input[type="checkbox"]')
      .forEach(cb => { cb.checked = checked; });

    applyFilters();
    updateStats();
  }

  // ============================================================
  // 过滤应用
  // ============================================================

  /**
   * 应用搜索和分类过滤
   */
  function applyFilters() {
    const hasSearch = !!state.searchQuery;
    const hasCategoryFilter = state.activeCategories.size < state.categories.length;

    if (!hasSearch && !hasCategoryFilter) {
      // 无过滤 - 恢复所有元素
      state.nodeGroup.selectAll('.graph-node')
        .classed('dimmed', false)
        .style('opacity', 1);

      state.linkGroup.selectAll('.graph-edge')
        .classed('dimmed', false)
        .style('opacity', 0.5);

      state.edgeLabelGroup.selectAll('.graph-edge-label')
        .classed('highlighted', false);
      return;
    }

    // 计算可见节点 ID 集合
    const visibleNodeIds = new Set();
    state.nodes.forEach(n => {
      if (isNodeVisible(n)) {
        visibleNodeIds.add(n.id);
      }
    });

    // 如果有搜索，找出匹配节点及其直接邻居
    let highlightNodeIds = new Set();
    if (hasSearch) {
      state.nodes.forEach(n => {
        if (n.name.toLowerCase().includes(state.searchQuery.toLowerCase())) {
          highlightNodeIds.add(n.id);
          // 添加邻居
          getConnectedNodes(n.id).forEach(c => highlightNodeIds.add(c.node.id));
        }
      });
    }

    // 更新节点样式
    state.nodeGroup.selectAll('.graph-node')
      .each(function (d) {
        const el = d3.select(this);
        const isVisible = visibleNodeIds.has(d.id);

        if (hasSearch) {
          if (highlightNodeIds.size > 0) {
            const isMatch = d.name.toLowerCase().includes(state.searchQuery.toLowerCase());
            const isNeighbor = highlightNodeIds.has(d.id) && !isMatch;
            el.classed('dimmed', !isVisible && !isNeighbor);
            el.style('opacity', isVisible ? 1 : (isNeighbor ? 0.5 : 0.1));
          } else {
            el.classed('dimmed', !isVisible);
            el.style('opacity', isVisible ? 1 : 0.1);
          }
        } else {
          el.classed('dimmed', !isVisible);
          el.style('opacity', isVisible ? 1 : 0.1);
        }
      });

    // 更新边样式
    state.linkGroup.selectAll('.graph-edge')
      .each(function (e) {
        const el = d3.select(this);
        const srcId = typeof e.source === 'object' ? e.source.id : e.source;
        const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
        const isEdgeVisible = visibleNodeIds.has(srcId) && visibleNodeIds.has(tgtId);

        if (hasSearch && highlightNodeIds.size > 0) {
          const isEdgeRelated = highlightNodeIds.has(srcId) && highlightNodeIds.has(tgtId);
          el.classed('dimmed', !isEdgeRelated);
          el.style('opacity', isEdgeRelated ? 0.7 : 0.05);
        } else {
          el.classed('dimmed', !isEdgeVisible);
          el.style('opacity', isEdgeVisible ? 0.5 : 0.05);
        }
      });

    // 更新边标签
    state.edgeLabelGroup.selectAll('.graph-edge-label')
      .each(function (e) {
        const srcId = typeof e.source === 'object' ? e.source.id : e.source;
        const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
        const isEdgeVisible = visibleNodeIds.has(srcId) && visibleNodeIds.has(tgtId);
        d3.select(this).classed('highlighted', isEdgeVisible);
      });
  }

  // ============================================================
  // 统计信息更新
  // ============================================================

  function updateStats() {
    dom.nodeCount.textContent = state.nodes.length;
    dom.edgeCount.textContent = state.edges.length;
    dom.categoryCount.textContent = state.categories.length;
    dom.visibleCount.textContent = getVisibleNodeCount();
  }

  // ============================================================
  // 图例
  // ============================================================

  function buildLegend() {
    dom.legendItems.innerHTML = '';
    state.categories.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-color" style="background: ${cat.color};"></span>
        <span>${cat.name}</span>
      `;
      dom.legendItems.appendChild(item);
    });
  }

  // ============================================================
  // 详情面板
  // ============================================================

  function showDetailPanel(node) {
    // 填充数据
    dom.detailNodeName.textContent = node.name;

    // 分类徽章
    const color = getCategoryColor(node.category);
    dom.detailCategoryBadge.textContent = node.category;
    dom.detailCategoryBadge.style.background = color;

    // 重要性星星
    const starsHtml = [];
    for (let i = 1; i <= 5; i++) {
      starsHtml.push(`<span class="star ${i <= node.importance ? 'filled' : ''}">&#9733;</span>`);
    }
    dom.detailImportance.innerHTML = starsHtml.join('');

    // 描述
    dom.detailDescription.textContent = node.description || '暂无描述';

    // 关联节点
    const connections = getConnectedNodes(node.id);
    dom.connectionCount.textContent = connections.length;

    dom.connectionList.innerHTML = '';
    if (connections.length === 0) {
      dom.connectionList.innerHTML = '<li style="color: var(--text-muted); font-size: 0.82rem; padding: 8px;">暂无关联节点</li>';
    } else {
      connections.forEach(conn => {
        const li = document.createElement('li');
        li.className = 'connection-item';
        const connColor = getCategoryColor(conn.node.category);
        const directionIcon = conn.direction === 'out' ? 'fa-arrow-right' : 'fa-arrow-left';
        li.innerHTML = `
          <span class="connection-item-color" style="background: ${connColor};"></span>
          <span class="connection-item-name">${conn.node.name}</span>
          <span class="connection-item-relation">
            <i class="fas ${directionIcon}" style="font-size: 0.6em; margin-right: 3px;"></i>
            ${conn.relation}
          </span>
        `;
        // 点击关联节点导航
        li.addEventListener('click', () => {
          navigateToNode(conn.node.id);
        });
        dom.connectionList.appendChild(li);
      });
    }

    // 显示面板
    dom.detailPanel.classList.add('open');
  }

  function closeDetailPanel() {
    dom.detailPanel.classList.remove('open');
    state.selectedNode = null;
    state.nodeGroup.selectAll('.graph-node').classed('selected', false);
  }

  /**
   * 导航到指定节点（居中并选中）
   */
  function navigateToNode(nodeId) {
    const node = state.nodes.find(n => n.id === nodeId);
    if (!node) return;

    // 如果节点不在可见分类中，先启用其分类
    if (!state.activeCategories.has(node.category)) {
      state.activeCategories.add(node.category);
      buildCategoryFilters();
      applyFilters();
    }

    // 居中到节点位置
    const container = dom.graphContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const scale = 1.2;
    const transform = d3.zoomIdentity
      .translate(width / 2 - (node.x || 0) * scale, height / 2 - (node.y || 0) * scale)
      .scale(scale);

    state.svg.transition()
      .duration(600)
      .call(state.zoom.transform, transform);

    // 选中节点
    setTimeout(() => selectNode(node), 300);
  }

  // ============================================================
  // 添加/编辑节点
  // ============================================================

  function populateNodeCategoryDropdown() {
    // 清空现有选项（保留默认）
    dom.nodeCategory.innerHTML = '<option value="">请选择分类</option>';
    state.categories.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.name;
      option.textContent = cat.name;
      dom.nodeCategory.appendChild(option);
    });
  }

  function openAddNodeModal() {
    // 重置表单
    dom.nodeEditId.value = '';
    dom.nodeName.value = '';
    dom.nodeCategory.value = '';
    dom.nodeDescription.value = '';
    dom.nodeImportance.value = '3';
    dom.nodeDescHint.textContent = '0 / 500';

    // 重置重要性选择器
    updateImportanceSelector(3);

    // 清除错误
    clearFormErrors(dom.nodeForm);

    // 更新标题
    dom.nodeModalTitle.innerHTML = '<i class="fas fa-plus-circle"></i><span>添加节点</span>';

    // 打开模态框
    openModal(dom.nodeModal);
  }

  function openEditNodeModal(node) {
    // 填充表单
    dom.nodeEditId.value = node.id;
    dom.nodeName.value = node.name;
    dom.nodeCategory.value = node.category;
    dom.nodeDescription.value = node.description || '';
    dom.nodeImportance.value = node.importance;
    dom.nodeDescHint.textContent = `${(node.description || '').length} / 500`;

    // 更新重要性选择器
    updateImportanceSelector(node.importance);

    // 清除错误
    clearFormErrors(dom.nodeForm);

    // 更新标题
    dom.nodeModalTitle.innerHTML = '<i class="fas fa-edit"></i><span>编辑节点</span>';

    // 打开模态框
    openModal(dom.nodeModal);
  }

  function saveNode() {
    // 验证
    let valid = true;
    const name = dom.nodeName.value.trim();
    const category = dom.nodeCategory.value;
    const description = dom.nodeDescription.value.trim();
    const importance = parseInt(dom.nodeImportance.value) || 3;
    const editId = dom.nodeEditId.value;

    // 名称验证
    if (!name) {
      showFieldError(dom.nodeName, dom.nodeNameError, '请输入节点名称');
      valid = false;
    } else {
      // 检查名称唯一性（编辑时排除自身）
      const duplicate = state.nodes.find(n => n.name === name && n.id !== editId);
      if (duplicate) {
        showFieldError(dom.nodeName, dom.nodeNameError, '该名称已存在，请使用其他名称');
        valid = false;
      } else {
        clearFieldError(dom.nodeName, dom.nodeNameError);
      }
    }

    // 分类验证
    if (!category) {
      showFieldError(dom.nodeCategory, dom.nodeCategoryError, '请选择分类');
      valid = false;
    } else {
      clearFieldError(dom.nodeCategory, dom.nodeCategoryError);
    }

    if (!valid) return;

    if (editId) {
      // 编辑模式
      const node = state.nodes.find(n => n.id === editId);
      if (node) {
        node.name = name;
        node.category = category;
        node.description = description;
        node.importance = importance;

        // 更新详情面板（如果正在显示）
        if (state.selectedNode && state.selectedNode.id === editId) {
          showDetailPanel(node);
        }

        showToast('success', '更新成功', `节点"${name}"已更新`);
      }
    } else {
      // 添加模式
      const newNode = {
        id: generateId(name),
        name: name,
        category: category,
        description: description,
        importance: importance
      };
      state.nodes.push(newNode);
      showToast('success', '添加成功', `节点"${name}"已添加到知识图谱`);
    }

    saveToLocalStorage();
    renderGraph();
    updateStats();
    buildCategoryFilters();
    closeModal(dom.nodeModal);
  }

  // ============================================================
  // 添加关系
  // ============================================================

  function openAddEdgeModal() {
    // 清空表单
    dom.edgeSource.value = '';
    dom.edgeTarget.value = '';
    dom.edgeRelation.value = '';
    clearFormErrors(dom.edgeForm);

    // 填充下拉选项
    populateEdgeDropdowns();

    openModal(dom.edgeModal);
  }

  function populateEdgeDropdowns() {
    // 源节点
    dom.edgeSource.innerHTML = '<option value="">请选择源节点</option>';
    // 目标节点
    dom.edgeTarget.innerHTML = '<option value="">请选择目标节点</option>';

    state.nodes.forEach(node => {
      const opt1 = document.createElement('option');
      opt1.value = node.id;
      opt1.textContent = node.name;
      dom.edgeSource.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = node.id;
      opt2.textContent = node.name;
      dom.edgeTarget.appendChild(opt2);
    });
  }

  function saveEdge() {
    let valid = true;
    const source = dom.edgeSource.value;
    const target = dom.edgeTarget.value;
    const relation = dom.edgeRelation.value.trim();

    // 验证
    if (!source) {
      showFieldError(dom.edgeSource, dom.edgeSourceError, '请选择源节点');
      valid = false;
    } else {
      clearFieldError(dom.edgeSource, dom.edgeSourceError);
    }

    if (!target) {
      showFieldError(dom.edgeTarget, dom.edgeTargetError, '请选择目标节点');
      valid = false;
    } else {
      clearFieldError(dom.edgeTarget, dom.edgeTargetError);
    }

    if (!relation) {
      showFieldError(dom.edgeRelation, dom.edgeRelationError, '请输入关系类型');
      valid = false;
    } else {
      clearFieldError(dom.edgeRelation, dom.edgeRelationError);
    }

    if (!valid) return;

    // 检查源和目标不能相同
    if (source === target) {
      showFieldError(dom.edgeTarget, dom.edgeTargetError, '源节点和目标节点不能相同');
      return;
    }

    // 检查重复边
    const duplicate = state.edges.find(e => {
      const srcId = typeof e.source === 'object' ? e.source.id : e.source;
      const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
      return srcId === source && tgtId === target && e.relation === relation;
    });

    if (duplicate) {
      showToast('warning', '关系已存在', '该节点之间已存在相同类型的关系');
      return;
    }

    // 添加边
    const newEdge = {
      source: source,
      target: target,
      relation: relation
    };
    state.edges.push(newEdge);

    saveToLocalStorage();
    renderGraph();
    updateStats();
    closeModal(dom.edgeModal);

    const srcNode = state.nodes.find(n => n.id === source);
    const tgtNode = state.nodes.find(n => n.id === target);
    showToast('success', '添加成功', `已添加关系：${srcNode ? srcNode.name : source} → ${tgtNode ? tgtNode.name : target}`);
  }

  // ============================================================
  // 删除节点
  // ============================================================

  function deleteNode(node) {
    const connectedCount = getConnectedEdges(node.id).length;
    const msg = connectedCount > 0
      ? `确定要删除节点"${node.name}"吗？该节点有 ${connectedCount} 条关联关系，将一并删除。`
      : `确定要删除节点"${node.name}"吗？`;

    showConfirm(msg, () => {
      // 移除关联的边
      state.edges = state.edges.filter(e => {
        const srcId = typeof e.source === 'object' ? e.source.id : e.source;
        const tgtId = typeof e.target === 'object' ? e.target.id : e.target;
        return srcId !== node.id && tgtId !== node.id;
      });

      // 移除节点
      state.nodes = state.nodes.filter(n => n.id !== node.id);

      // 关闭详情面板
      if (state.selectedNode && state.selectedNode.id === node.id) {
        closeDetailPanel();
      }

      saveToLocalStorage();
      renderGraph();
      updateStats();
      buildCategoryFilters();

      showToast('success', '删除成功', `节点"${node.name}"已从知识图谱中移除`);
    });
  }

  // ============================================================
  // 模态框管理
  // ============================================================

  function openModal(modal) {
    modal.classList.add('active');
    // 聚焦第一个输入框
    setTimeout(() => {
      const firstInput = modal.querySelector('input[type="text"], select, textarea');
      if (firstInput) firstInput.focus();
    }, 200);
  }

  function closeModal(modal) {
    modal.classList.remove('active');
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(m => {
      m.classList.remove('active');
    });
  }

  /**
   * 显示确认对话框
   */
  function showConfirm(message, onConfirm) {
    dom.confirmMessage.textContent = message;
    openModal(dom.confirmModal);

    // 移除旧的事件监听器
    const newOk = dom.confirmOk.cloneNode(true);
    dom.confirmOk.parentNode.replaceChild(newOk, dom.confirmOk);
    const newCancel = dom.confirmCancel.cloneNode(true);
    dom.confirmCancel.parentNode.replaceChild(newCancel, dom.confirmCancel);

    // 重新获取引用
    const okBtn = document.getElementById('confirmOk');
    const cancelBtn = document.getElementById('confirmCancel');

    okBtn.addEventListener('click', () => {
      closeModal(dom.confirmModal);
      if (onConfirm) onConfirm();
    });

    cancelBtn.addEventListener('click', () => {
      closeModal(dom.confirmModal);
    });
  }

  // ============================================================
  // 表单辅助
  // ============================================================

  function showFieldError(input, errorEl, message) {
    input.classList.add('error');
    if (errorEl) errorEl.textContent = message;
  }

  function clearFieldError(input, errorEl) {
    input.classList.remove('error');
    if (errorEl) errorEl.textContent = '';
  }

  function clearFormErrors(form) {
    form.querySelectorAll('.form-input, .form-select, .form-textarea').forEach(el => {
      el.classList.remove('error');
    });
    form.querySelectorAll('.form-error').forEach(el => {
      el.textContent = '';
    });
  }

  // ============================================================
  // 重要性选择器
  // ============================================================

  function initImportanceSelector() {
    const stars = dom.importanceSelector.querySelectorAll('.importance-star');

    stars.forEach(star => {
      star.addEventListener('click', () => {
        const value = parseInt(star.dataset.value);
        dom.nodeImportance.value = value;
        updateImportanceSelector(value);
      });

      star.addEventListener('mouseenter', () => {
        const value = parseInt(star.dataset.value);
        stars.forEach(s => {
          const sv = parseInt(s.dataset.value);
          s.classList.toggle('hover-preview', sv <= value && !s.classList.contains('active'));
        });
      });
    });

    dom.importanceSelector.addEventListener('mouseleave', () => {
      stars.forEach(s => s.classList.remove('hover-preview'));
    });
  }

  function updateImportanceSelector(value) {
    const stars = dom.importanceSelector.querySelectorAll('.importance-star');
    stars.forEach(s => {
      const sv = parseInt(s.dataset.value);
      s.classList.toggle('active', sv <= value);
    });
    dom.nodeImportance.value = value;
  }

  // ============================================================
  // 缩放控制
  // ============================================================

  function handleZoomIn() {
    state.svg.transition().duration(300).call(state.zoom.scaleBy, 1.3);
  }

  function handleZoomOut() {
    state.svg.transition().duration(300).call(state.zoom.scaleBy, 0.7);
  }

  function handleZoomReset() {
    const container = dom.graphContainer;
    const width = container.clientWidth;
    const height = container.clientHeight;
    state.svg.transition().duration(500).call(
      state.zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8).translate(-width / 2, -height / 2)
    );
  }

  // ============================================================
  // 全屏切换
  // ============================================================

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        showToast('warning', '提示', '无法进入全屏模式');
      });
    } else {
      document.exitFullscreen();
    }
  }

  // ============================================================
  // 移动端菜单
  // ============================================================

  function toggleMobileMenu() {
    dom.sidebar.classList.toggle('open');
  }

  // ============================================================
  // 分类折叠
  // ============================================================

  function toggleCategoryCollapse() {
    const list = dom.categoryList;
    const icon = dom.categoryToggle.querySelector('i');
    if (list.style.display === 'none') {
      list.style.display = 'flex';
      icon.className = 'fas fa-chevron-up';
    } else {
      list.style.display = 'none';
      icon.className = 'fas fa-chevron-down';
    }
  }

  // ============================================================
  // 键盘快捷键
  // ============================================================

  function handleKeydown(event) {
    // Escape 关闭模态框和面板
    if (event.key === 'Escape') {
      if (dom.confirmModal.classList.contains('active')) {
        closeModal(dom.confirmModal);
      } else if (dom.nodeModal.classList.contains('active')) {
        closeModal(dom.nodeModal);
      } else if (dom.edgeModal.classList.contains('active')) {
        closeModal(dom.edgeModal);
      } else if (dom.helpModal.classList.contains('active')) {
        closeModal(dom.helpModal);
      } else if (dom.detailPanel.classList.contains('open')) {
        closeDetailPanel();
      }
    }
  }

  // ============================================================
  // 事件绑定
  // ============================================================

  function bindEvents() {
    // 搜索
    dom.searchInput.addEventListener('input', debounce(handleSearch, DEBOUNCE_DELAY));
    dom.searchClear.addEventListener('click', clearSearch);

    // 分类筛选
    dom.selectAll.addEventListener('change', handleSelectAll);
    dom.categoryToggle.addEventListener('click', toggleCategoryCollapse);

    // 操作按钮
    dom.btnAddNode.addEventListener('click', openAddNodeModal);
    dom.btnAddEdge.addEventListener('click', openAddEdgeModal);
    dom.btnExport.addEventListener('click', exportData);
    dom.btnReset.addEventListener('click', resetData);

    // 缩放控制
    dom.zoomIn.addEventListener('click', handleZoomIn);
    dom.zoomOut.addEventListener('click', handleZoomOut);
    dom.zoomReset.addEventListener('click', handleZoomReset);

    // 详情面板
    dom.detailClose.addEventListener('click', closeDetailPanel);
    dom.detailEditBtn.addEventListener('click', () => {
      if (state.selectedNode) openEditNodeModal(state.selectedNode);
    });
    dom.detailDeleteBtn.addEventListener('click', () => {
      if (state.selectedNode) deleteNode(state.selectedNode);
    });

    // 节点模态框
    dom.nodeModalClose.addEventListener('click', () => closeModal(dom.nodeModal));
    dom.nodeModalCancel.addEventListener('click', () => closeModal(dom.nodeModal));
    dom.nodeModalConfirm.addEventListener('click', saveNode);

    // 描述字数统计
    dom.nodeDescription.addEventListener('input', () => {
      const len = dom.nodeDescription.value.length;
      dom.nodeDescHint.textContent = `${len} / 500`;
    });

    // 边模态框
    dom.edgeModalClose.addEventListener('click', () => closeModal(dom.edgeModal));
    dom.edgeModalCancel.addEventListener('click', () => closeModal(dom.edgeModal));
    dom.edgeModalConfirm.addEventListener('click', saveEdge);

    // 确认对话框
    dom.confirmModalClose.addEventListener('click', () => closeModal(dom.confirmModal));

    // 帮助模态框
    dom.btnHelp.addEventListener('click', () => openModal(dom.helpModal));
    dom.helpModalClose.addEventListener('click', () => closeModal(dom.helpModal));
    dom.helpModalOk.addEventListener('click', () => closeModal(dom.helpModal));

    // 全屏
    dom.btnFullscreen.addEventListener('click', toggleFullscreen);

    // 键盘快捷键
    document.addEventListener('keydown', handleKeydown);

    // 点击模态框背景关闭
    [dom.nodeModal, dom.edgeModal, dom.confirmModal, dom.helpModal].forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal(modal);
      });
    });

    // 重要性选择器
    initImportanceSelector();

    // 移动端菜单按钮（如果存在）
    const hamburger = document.querySelector('.header-hamburger');
    if (hamburger) {
      hamburger.addEventListener('click', toggleMobileMenu);
    }

    // 点击图谱区域关闭移动端侧边栏
    dom.graphContainer.addEventListener('click', () => {
      if (dom.sidebar.classList.contains('open')) {
        dom.sidebar.classList.remove('open');
      }
    });
  }

  // ============================================================
  // 初始化
  // ============================================================

  function init() {
    cacheDomElements();
    bindEvents();
    loadData();
  }

  // DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
