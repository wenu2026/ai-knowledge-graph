# AI 知识图谱 🧠

一个交互式的人工智能知识图谱可视化网站，用于沉淀和展示 AI 学习知识。

![知识图谱预览](https://img.shields.io/badge/状态-已完成-brightgreen) ![GitHub Pages](https://img.shields.io/badge/部署-GitHub%20Pages-blue)

## ✨ 功能特性

- 🌐 **交互式力导向图** — 基于 D3.js 的知识图谱可视化，支持缩放、拖拽、平移
- 🔍 **实时搜索** — 快速搜索知识点，高亮匹配结果及其关联
- 🏷️ **分类筛选** — 按类别（基础概念、模型架构、训练技术等）过滤节点
- 📋 **详情面板** — 点击节点查看详细说明、关联关系
- ✏️ **数据编辑** — 支持添加、编辑、删除知识点和关系
- 💾 **本地持久化** — 数据自动保存到 LocalStorage
- 📤 **数据导出** — 一键导出 JSON 数据文件
- 📱 **响应式设计** — 支持桌面和移动端访问
- 🌙 **暗色主题** — 现代暗色 UI 设计

## 🚀 快速开始

### 本地预览

1. 克隆仓库：
```bash
git clone https://github.com/你的用户名/ai-knowledge-graph.git
cd ai-knowledge-graph
```

2. 使用任意静态服务器打开（因为使用了 fetch 加载 JSON）：

**方法一：Python**
```bash
python3 -m http.server 8080
```
然后访问 http://localhost:8080

**方法二：Node.js**
```bash
npx serve .
```

**方法三：VS Code**
安装 Live Server 扩展，右键 `index.html` → Open with Live Server

### 部署到 GitHub Pages

1. 将代码推送到 GitHub 仓库

2. 进入仓库 → **Settings** → **Pages**

3. Source 选择 `Deploy from a branch`

4. Branch 选择 `main`，文件夹选 `/ (root)`

5. 点击 Save，等待几分钟后访问 `https://你的用户名.github.io/ai-knowledge-graph/`

## 📁 项目结构

```
ai-knowledge-graph/
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式文件
├── js/
│   └── app.js          # 核心应用逻辑
├── data/
│   └── knowledge.json  # 知识图谱数据
└── README.md           # 说明文档
```

## 📊 数据格式

知识图谱数据存储在 `data/knowledge.json` 中，格式如下：

```json
{
  "nodes": [
    {
      "id": "ai",
      "name": "人工智能",
      "category": "基础概念",
      "description": "人工智能是计算机科学的一个分支...",
      "importance": 5
    }
  ],
  "edges": [
    {
      "source": "ai",
      "target": "ml",
      "relation": "包含"
    }
  ],
  "categories": [
    {
      "name": "基础概念",
      "color": "#6366f1"
    }
  ]
}
```

### 字段说明

| 字段 | 说明 |
|------|------|
| `id` | 节点唯一标识（自动生成或手动指定） |
| `name` | 节点显示名称 |
| `category` | 所属分类（需在 categories 中定义） |
| `description` | 详细描述 |
| `importance` | 重要性（1-5，影响节点大小） |
| `relation` | 关系描述（如"包含"、"基于"、"使用"） |

## 🎯 自定义指南

### 添加新的知识点

1. **通过界面添加**：点击左侧栏「添加节点」按钮
2. **通过编辑 JSON**：直接修改 `data/knowledge.json` 文件

### 添加新的分类

在 `data/knowledge.json` 的 `categories` 数组中添加：

```json
{
  "name": "你的分类名",
  "color": "#颜色代码"
}
```

### 修改主题颜色

编辑 `css/style.css` 顶部的 CSS 自定义属性：

```css
:root {
  --bg-primary: #0f1117;
  --accent-primary: #6366f1;
  /* ... */
}
```

## 🛠️ 技术栈

- **D3.js v7** — 数据驱动的文档操作库，用于力导向图可视化
- **原生 HTML/CSS/JS** — 无框架依赖，轻量高效
- **LocalStorage** — 浏览器本地数据持久化
- **Font Awesome** — 图标库

## 📄 License

MIT License
