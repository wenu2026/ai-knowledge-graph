# AI 知识图谱 🧠

一个交互式的人工智能知识图谱可视化网站，以飞书为数据底座，支持 LLM 自动抽取知识实体和关系。

![知识图谱预览](https://img.shields.io/badge/状态-已完成-brightgreen) ![GitHub Pages](https://img.shields.io/badge/部署-GitHub%20Pages-blue) ![飞书集成](https://img.shields.io/badge/数据源-飞书-blue) ![Cloudflare Workers](https://img.shields.io/badge/后端-Cloudflare%20Workers-orange)

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    飞书 (数据源层)                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  多维表格-节点  │  │  多维表格-关系  │  │  飞书文档/知识库 │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
└─────────┼─────────────────┼─────────────────┼───────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────┐
│           Cloudflare Workers (数据处理层)                  │
│  飞书API拉取 → 数据清洗转换 → LLM实体关系抽取 → REST API  │
└───────────────────────┬─────────────────────────────────┘
                        │ GET /api/graph
                        ▼
┌─────────────────────────────────────────────────────────┐
│              前端展示层 (GitHub Pages)                     │
│  D3.js 力导向图 · 搜索筛选 · 详情面板 · 响应式暗色主题     │
│  https://wenu2026.github.io/ai-knowledge-graph/          │
└─────────────────────────────────────────────────────────┘
```

## ✨ 功能特性

### 展示层
- 🌐 **交互式力导向图** — 基于 D3.js，支持缩放、拖拽、平移
- 🔍 **实时搜索** — 快速搜索知识点，高亮匹配结果及其关联
- 🏷️ **分类筛选** — 按类别过滤节点（20个AI领域分类）
- 📋 **详情面板** — 点击节点查看详细说明、关联关系
- ✏️ **数据编辑** — 支持添加、编辑、删除知识点和关系
- 📱 **响应式设计** — 支持桌面和移动端访问
- 🌙 **暗色主题** — 现代毛玻璃风格 UI

### 数据层
- 📝 **飞书文档集成** — 从飞书文档/知识库中自动抽取知识
- 🤖 **LLM 智能抽取** — 基于 DeepSeek/GPT 自动识别实体和关系
- 🔄 **自动同步** — 每6小时自动从飞书拉取最新数据
- ✅ **人工审核** — 抽取结果在飞书多维表格中审核修正

## 📁 项目结构

```
ai-knowledge-graph/
├── index.html              # 主页面
├── css/
│   └── style.css           # 样式文件
├── js/
│   └── app.js              # 前端核心逻辑
├── data/
│   └── knowledge.json      # 静态数据（API不可用时的回退）
├── backend/                # Cloudflare Workers 后端
│   ├── wrangler.toml       # Workers 配置
│   ├── package.json        # 依赖配置
│   └── src/
│       ├── index.js        # 主入口（API路由 + 同步逻辑）
│       ├── feishu.js       # 飞书 API 客户端
│       ├── llm.js          # LLM 实体关系抽取
│       └── graph.js        # 图谱数据转换
├── docs/
│   └── feishu-data-model.md # 飞书数据模型设计文档
└── README.md               # 说明文档
```

## 🚀 部署指南

### 第一步：创建飞书应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用
2. 记录 **App ID** 和 **App Secret**
3. 配置权限（在「权限管理」中搜索并开通）：
   - `bitable:app` — 读取和写入多维表格
   - `docx:document` — 读取文档内容
   - `wiki:wiki` — 读取知识库
   - `drive:drive` — 读取云空间文件
4. 发布应用版本

### 第二步：创建飞书多维表格

创建一个多维表格，包含以下 4 张数据表：

#### 表1: 知识节点

| 字段名 | 字段类型 | 说明 |
|--------|---------|------|
| 节点ID | 文本 | 唯一标识，如 `transformer` |
| 名称 | 文本 | 知识点名称 |
| 分类 | 单选 | 基础概念/核心领域/模型架构/语言模型等 |
| 描述 | 多行文本 | 详细说明 |
| 重要性 | 数字 | 1-5 |
| 来源文档 | 超链接 | 关联飞书文档 |
| 状态 | 单选 | 草稿/已审核/已发布 |

#### 表2: 知识关系

| 字段名 | 字段类型 | 说明 |
|--------|---------|------|
| 源节点 | 文本 | 起始节点名称 |
| 目标节点 | 文本 | 目标节点名称 |
| 关系类型 | 文本 | 包含/基于/使用/属于等 |
| 描述 | 多行文本 | 关系说明 |
| 置信度 | 数字 | 0-1，LLM抽取置信度 |
| 抽取方式 | 单选 | 手动录入/LLM自动抽取 |

#### 表3: 文档队列

| 字段名 | 字段类型 | 说明 |
|--------|---------|------|
| 文档ID | 文本 | 飞书文档 token |
| 文档标题 | 文本 | 文档标题 |
| 处理状态 | 单选 | 待处理/处理中/已完成/失败 |
| 错误信息 | 文本 | 失败时的错误描述 |

#### 表4: 分类配置

| 字段名 | 字段类型 | 说明 |
|--------|---------|------|
| 名称 | 文本 | 分类名称 |
| 颜色 | 文本 | Hex颜色值，如 `#6366f1` |

> 💡 详细数据模型设计见 [docs/feishu-data-model.md](docs/feishu-data-model.md)

### 第三步：获取多维表格 Token 和 Table ID

1. 打开多维表格，URL 格式为：`https://xxx.feishu.cn/base/XXXXX?table=tblYYYYY`
2. `XXXXX` 就是 **app_token**（`FEISHU_BITABLE_APP_TOKEN`）
3. `tblYYYYY` 就是各表的 **table_id**

### 第四步：部署后端到 Cloudflare Workers

```bash
# 1. 安装依赖
cd backend
npm install

# 2. 登录 Cloudflare
npx wrangler login

# 3. 配置环境变量（Secrets）
npx wrangler secret put FEISHU_APP_ID
npx wrangler secret put FEISHU_APP_SECRET
npx wrangler secret put LLM_API_KEY
npx wrangler secret put LLM_API_BASE        # 如 https://api.deepseek.com/v1
npx wrangler secret put LLM_MODEL           # 如 deepseek-chat
npx wrangler secret put FEISHU_BITABLE_APP_TOKEN
npx wrangler secret put FEISHU_NODES_TABLE_ID
npx wrangler secret put FEISHU_EDGES_TABLE_ID
npx wrangler secret put FEISHU_CATEGORIES_TABLE_ID
npx wrangler secret put FEISHU_QUEUE_TABLE_ID

# 4. 本地开发测试
npx wrangler dev

# 5. 部署到生产环境
npx wrangler deploy
```

部署成功后会得到类似地址：`https://ai-knowledge-graph-api.你的子域.workers.dev`

### 第五步：配置前端连接后端

编辑 `js/app.js`，修改以下配置：

```javascript
const API_URL = 'https://ai-knowledge-graph-api.你的子域.workers.dev/api/graph';
const USE_API = true;  // 改为 true 启用 API 数据源
```

### 第六步：推送更新到 GitHub Pages

```bash
git add -A
git commit -m "feat: 集成飞书数据源和后端API"
git push origin main
```

## 📖 使用流程

### 日常使用

1. **在飞书中写学习笔记** — 正常在飞书文档中记录 AI 学习内容
2. **添加到处理队列** — 将文档信息填入「文档队列」表
3. **自动抽取** — 后端每6小时自动处理队列中的文档，或手动调用 `POST /api/extract`
4. **审核修正** — 在飞书多维表格中查看和修正抽取结果
5. **发布上线** — 将节点状态改为「已发布」
6. **网站更新** — 下次同步后网站自动展示新知识

### API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/graph` | 获取完整图谱数据（前端调用） |
| POST | `/api/sync` | 手动触发飞书数据同步 |
| POST | `/api/extract` | 触发 LLM 文档抽取 |
| GET | `/api/status` | 查看同步状态 |

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端展示 | D3.js v7、原生 HTML/CSS/JS、Font Awesome |
| 数据源 | 飞书多维表格、飞书文档/知识库 |
| 后端服务 | Cloudflare Workers |
| AI 抽取 | DeepSeek / OpenAI API（OpenAI 兼容格式） |
| 部署 | GitHub Pages（前端）、Cloudflare Workers（后端） |

## 📄 License

MIT License
