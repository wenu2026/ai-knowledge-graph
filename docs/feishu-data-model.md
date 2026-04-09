# 飞书多维表格数据模型设计文档

> AI 知识图谱系统 —— 飞书 (Lark) Bitable 数据模型

---

## 目录

1. [飞书多维表格结构设计](#1-飞书多维表格结构设计)
2. [数据流程说明](#2-数据流程说明)
3. [LLM 抽取 Prompt 设计](#3-llm-抽取-prompt-设计)
4. [飞书应用配置说明](#4-飞书应用配置说明)

---

## 1. 飞书多维表格结构设计

本系统使用飞书多维表格 (Bitable) 作为知识图谱数据的管理后台。多维表格共包含 **4 张数据表**，分别负责知识节点管理、知识关系管理、文档队列管理和分类配置。

### 整体架构概览

```
┌─────────────────────────────────────────────────────┐
│                 飞书多维表格 (Bitable)                 │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                │
│  │  知识节点     │◄─┤  知识关系     │                │
│  │  (Nodes)     │──┤  (Relations) │                │
│  └──────────────┘  └──────────────┘                │
│                                                     │
│  ┌──────────────┐  ┌──────────────┐                │
│  │  文档队列     │  │  分类配置     │                │
│  │  (DocQueue)  │  │  (Categories)│                │
│  └──────────────┘  └──────────────┘                │
└─────────────────────────────────────────────────────┘
```

---

### 表1: 知识节点 (Knowledge Nodes)

知识节点表是系统的核心表，存储所有从学习笔记中抽取出的 AI 知识实体。

| 字段名 | 字段标识 | 字段类型 | 是否必填 | 说明 |
|--------|----------|----------|----------|------|
| 节点ID | `node_id` | 文本 | 是 | 节点唯一标识，建议格式 `node_` + 时间戳或 UUID，支持自动生成或手动填写 |
| 名称 | `name` | 文本 | 是 | 知识节点的显示名称，如"Transformer"、"反向传播"等 |
| 分类 | `category` | 单选 | 是 | 节点所属分类，选项见下方分类列表 |
| 描述 | `description` | 多行文本 | 否 | 对该知识节点的详细描述和说明 |
| 重要性 | `importance` | 数字 | 否 | 重要性评分，取值范围 1-5，5 为最重要 |
| 来源文档 | `source_doc` | 超链接 | 否 | 关联的飞书文档链接，记录该节点的知识来源 |
| 标签 | `tags` | 多选 | 否 | 自定义标签，用于辅助分类和检索 |
| 创建时间 | `created_at` | 日期 | 是 | 节点创建时间，可设置为创建时自动填充 |
| 更新时间 | `updated_at` | 日期 | 否 | 节点最后更新时间，可设置为修改时自动填充 |
| 状态 | `status` | 单选 | 是 | 审核状态，选项：`草稿` / `已审核` / `已发布` |

#### 分类 (category) 可选值

| 分类名称 | 适用范围 |
|----------|----------|
| 基础概念 | 数学基础、概率统计、线性代数等 |
| 核心领域 | 机器学习、深度学习、强化学习等 |
| 学习方法 | 监督学习、无监督学习、自监督学习等 |
| 模型架构 | CNN、RNN、Transformer、GNN 等 |
| 语言模型 | GPT、BERT、LLaMA、GLM 等 |
| 多模态模型 | CLIP、DALL-E、GPT-4V 等 |
| 应用技术 | RAG、Fine-tuning、Prompt Engineering 等 |
| 表示学习 | Word2Vec、Embedding、对比学习等 |
| 训练技术 | 预训练、微调、RLHF、DPO 等 |
| 计算机视觉 | 图像分类、目标检测、图像分割等 |
| 自然语言处理 | 分词、命名实体识别、机器翻译等 |
| 语音技术 | ASR、TTS、语音合成等 |
| 应用领域 | 医疗AI、自动驾驶、金融AI等 |
| 前沿方向 | AGI、世界模型、AI Agent 等 |
| 工程实践 | 模型部署、推理优化、MLOps 等 |
| 工具框架 | PyTorch、TensorFlow、HuggingFace 等 |
| 硬件基础 | GPU、TPU、分布式训练等 |
| AI安全 | 对齐、可解释性、隐私保护等 |
| 里程碑 | ImageNet、AlphaGo、ChatGPT 等 |
| 应用产品 | ChatGPT、Midjourney、Copilot 等 |

#### 示例数据

| node_id | name | category | importance | status |
|---------|------|----------|------------|--------|
| node_001 | Transformer | 模型架构 | 5 | 已发布 |
| node_002 | 注意力机制 | 核心领域 | 5 | 已发布 |
| node_003 | GPT-4 | 语言模型 | 5 | 已审核 |
| node_004 | 反向传播 | 基础概念 | 4 | 已发布 |
| node_005 | RAG | 应用技术 | 4 | 草稿 |

---

### 表2: 知识关系 (Knowledge Relations)

知识关系表存储知识节点之间的关联关系，构成知识图谱的边 (Edge)。

| 字段名 | 字段标识 | 字段类型 | 是否必填 | 说明 |
|--------|----------|----------|----------|------|
| 关系ID | `relation_id` | 文本 | 是 | 关系唯一标识，建议格式 `rel_` + 时间戳或 UUID |
| 源节点 | `source` | 关联字段 | 是 | 关联到「知识节点」表的 `name` 字段，表示关系的起点 |
| 目标节点 | `target` | 关联字段 | 是 | 关联到「知识节点」表的 `name` 字段，表示关系的终点 |
| 关系类型 | `relation` | 文本 | 是 | 描述两个节点之间的关系类型 |
| 描述 | `description` | 多行文本 | 否 | 对该关系的详细说明 |
| 来源文档 | `source_doc` | 超链接 | 否 | 关联的飞书文档链接 |
| 置信度 | `confidence` | 数字 | 否 | LLM 抽取时的置信度，取值范围 0-1，1 表示完全确定 |
| 抽取方式 | `extraction_method` | 单选 | 是 | 数据录入方式，选项：`手动录入` / `LLM自动抽取` / `混合` |
| 创建时间 | `created_at` | 日期 | 是 | 关系创建时间 |

#### 常见关系类型 (relation)

| 关系类型 | 含义 | 示例 |
|----------|------|------|
| 包含 | A 包含 B | Transformer 包含 注意力机制 |
| 基于 | A 基于 B | GPT 基于 Transformer |
| 使用 | A 使用 B | BERT 使用 掩码语言模型 |
| 属于 | A 属于 B | CNN 属于 模型架构 |
| 改进 | A 改进 B | ResNet 改进 CNN |
| 应用于 | A 应用于 B | 目标检测 应用于 自动驾驶 |
| 演化为 | A 演化为 B | GPT-1 演化为 GPT-2 |
| 对比 | A 与 B 对比 | CNN 对比 RNN |
| 依赖 | A 依赖 B | 深度学习 依赖 反向传播 |
| 替代 | A 替代 B | Transformer 替代 RNN |

#### 示例数据

| relation_id | source | target | relation | confidence | extraction_method |
|-------------|--------|--------|----------|------------|-------------------|
| rel_001 | Transformer | 注意力机制 | 包含 | 0.98 | LLM自动抽取 |
| rel_002 | GPT-4 | Transformer | 基于 | 0.99 | LLM自动抽取 |
| rel_003 | BERT | Transformer | 基于 | 0.99 | LLM自动抽取 |
| rel_004 | ResNet | CNN | 改进 | 0.85 | 混合 |
| rel_005 | 深度学习 | 反向传播 | 依赖 | 0.90 | 手动录入 |

---

### 表3: 文档队列 (Document Queue)

文档队列表用于管理待处理的飞书文档，是整个数据流水线的入口。

| 字段名 | 字段标识 | 字段类型 | 是否必填 | 说明 |
|--------|----------|----------|----------|------|
| 文档ID | `doc_id` | 文本 | 是 | 飞书文档的唯一标识 (doc_token 或 obj_token) |
| 文档标题 | `title` | 文本 | 是 | 文档的标题名称 |
| 文档类型 | `doc_type` | 单选 | 是 | 文档来源类型，选项：`飞书文档` / `知识库` / `多维表格` |
| 处理状态 | `status` | 单选 | 是 | 当前处理状态，选项：`待处理` / `处理中` / `已完成` / `失败` |
| 最后处理时间 | `last_processed` | 日期 | 否 | 最近一次处理的时间戳 |
| 错误信息 | `error_message` | 文本 | 否 | 处理失败时的错误信息记录 |

#### 状态流转

```
待处理 ──► 处理中 ──► 已完成
                │
                └──► 失败 ──► 待处理 (重试)
```

#### 示例数据

| doc_id | title | doc_type | status | last_processed |
|--------|-------|----------|--------|----------------|
| doc_abc123 | Transformer 架构详解 | 飞书文档 | 已完成 | 2026-04-08 |
| doc_def456 | 深度学习训练技巧总结 | 飞书文档 | 待处理 | - |
| doc_ghi789 | RAG 技术实践笔记 | 知识库 | 处理中 | 2026-04-09 |

---

### 表4: 分类配置 (Categories)

分类配置表用于管理知识节点的分类体系，支持动态调整分类选项。

| 字段名 | 字段标识 | 字段类型 | 是否必填 | 说明 |
|--------|----------|----------|----------|------|
| 分类名称 | `name` | 文本 | 是 | 分类的显示名称，需与「知识节点」表的单选选项保持一致 |
| 颜色 | `color` | 文本 | 否 | 分类在图谱中的显示颜色，使用 HEX 颜色值，如 `#FF6B6B` |
| 图标 | `icon` | 文本 | 否 | 分类对应的图标标识，可使用 emoji 或图标名称 |
| 排序 | `sort_order` | 数字 | 否 | 分类在列表中的显示排序，数值越小越靠前 |
| 是否启用 | `enabled` | 复选框 | 是 | 控制该分类是否在系统中启用 |

#### 示例数据

| name | color | icon | sort_order | enabled |
|------|-------|------|------------|---------|
| 基础概念 | #4ECDC4 | 📐 | 1 | true |
| 核心领域 | #FF6B6B | 🎯 | 2 | true |
| 模型架构 | #45B7D1 | 🏗️ | 3 | true |
| 语言模型 | #96CEB4 | 💬 | 4 | true |
| 应用技术 | #FFEAA7 | 🔧 | 5 | true |
| 工具框架 | #DDA0DD | 🛠️ | 6 | true |
| 前沿方向 | #FF8C00 | 🚀 | 7 | true |

---

## 2. 数据流程说明

### 整体数据流架构

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│          │     │          │     │          │     │          │
│  飞书文档  │────►│ 文档队列  │────►│ LLM 抽取  │────►│ 知识节点  │
│ (笔记)   │     │ (Bitable)│     │ (后端)   │     │ (Bitable)│
│          │     │          │     │          │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
                                                            │
                                                            ▼
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│          │     │          │     │          │     │          │
│ 前端网站  │◄────│ JSON/API │◄────│ 数据同步  │◄────│ 人工审核  │
│ (图谱展示)│     │ (静态文件)│     │ (后端)   │     │ (飞书)   │
│          │     │          │     │          │     │          │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
```

### 详细流程说明

#### 步骤 1: 用户编写学习笔记

用户在飞书文档中编写 AI 相关的学习笔记。笔记内容可以涵盖：

- 概念定义与解释
- 模型架构分析
- 技术原理说明
- 实践经验总结
- 论文阅读笔记
- 工具使用心得

笔记应尽量结构化，使用标题、列表等方式组织内容，以便 LLM 更准确地抽取知识实体和关系。

#### 步骤 2: 添加文档到处理队列

用户（或自动机制）将待处理的飞书文档添加到多维表格的「文档队列」表中：

- 填写文档ID（可从飞书文档链接中获取）
- 填写文档标题
- 选择文档类型
- 处理状态自动设为「待处理」

也可以通过飞书机器人自动监听文档变更，当有新文档或文档更新时自动添加到队列。

#### 步骤 3: 后端定时拉取待处理文档

后端服务通过飞书开放平台 API 定时（如每 5 分钟）查询「文档队列」表中状态为「待处理」的记录：

1. 调用飞书 Bitable API 读取「文档队列」表
2. 筛选 `status = "待处理"` 的记录
3. 将对应记录的状态更新为「处理中」
4. 根据文档ID调用飞书文档 API 获取文档内容（Markdown 格式）

#### 步骤 4: 调用 LLM API 抽取实体和关系

后端将获取到的文档内容，配合预设的 System Prompt，发送给 LLM API 进行知识抽取：

1. **构建 Prompt**：将文档内容作为用户输入，配合 System Prompt（见第 3 节）
2. **调用 LLM**：通过 OpenAI / 智谱 / DeepSeek 等 API 发起请求
3. **解析结果**：将 LLM 返回的 JSON 结果解析为结构化的实体和关系数据
4. **去重处理**：与已有知识节点进行比对，避免重复创建

#### 步骤 5: 写入抽取结果到多维表格

将抽取结果写入飞书多维表格：

1. **写入知识节点**：将抽取到的实体写入「知识节点」表，状态设为「草稿」
2. **写入知识关系**：将抽取到的关系写入「知识关系」表
3. **更新文档队列**：将对应文档的处理状态更新为「已完成」
4. **记录置信度**：保留 LLM 抽取的置信度分数，供后续审核参考

#### 步骤 6: 用户审核和修正

用户在飞书多维表格中审核抽取结果：

1. 查看「知识节点」表中状态为「草稿」的记录
2. 修正错误的分类、描述或关系
3. 补充遗漏的知识节点和关系
4. 调整重要性评分
5. 将确认无误的记录状态改为「已审核」
6. 最终将「已审核」的记录状态改为「已发布」

#### 步骤 7: 同步数据到前端

后端定时读取多维表格中状态为「已发布」的数据：

1. 读取「知识节点」表中 `status = "已发布"` 的所有记录
2. 读取「知识关系」表中关联的已发布节点的关系
3. 将数据转换为前端所需的 JSON 格式
4. 生成静态 JSON 文件或通过 API 提供给前端

#### 步骤 8: 前端展示知识图谱

前端网站加载更新后的数据：

1. 读取最新的 `knowledge.json` 数据文件
2. 使用 D3.js / ECharts 等可视化库渲染知识图谱
3. 支持按分类筛选、搜索、缩放等交互操作
4. 展示节点的详细信息（描述、来源文档等）

---

### 错误处理与重试机制

| 错误场景 | 处理方式 |
|----------|----------|
| 文档内容获取失败 | 将文档队列状态设为「失败」，记录错误信息，支持手动重试 |
| LLM API 调用失败 | 重试 3 次，间隔递增（5s、15s、45s） |
| LLM 返回格式异常 | 记录原始返回内容，跳过该文档，标记为「失败」 |
| 飞书 API 频率限制 | 自动等待后重试，遵守飞书 API 速率限制 |
| 数据写入失败 | 记录失败日志，保留处理结果供手动补录 |

---

## 3. LLM 抽取 Prompt 设计

### System Prompt 模板

以下是用于从 AI 学习笔记中抽取知识实体和关系的 System Prompt 模板：

```
你是一个专业的 AI 知识图谱构建助手。你的任务是从用户提供的 AI 学习笔记中抽取知识实体（节点）和实体之间的关系（边）。

## 抽取规则

### 实体抽取规则
1. 从文本中识别所有重要的 AI 相关概念、模型、算法、技术、工具、框架等知识实体
2. 每个实体需要归类到以下分类之一：
   - 基础概念：数学基础、概率统计、线性代数、优化理论等
   - 核心领域：机器学习、深度学习、强化学习、迁移学习等
   - 学习方法：监督学习、无监督学习、自监督学习、半监督学习等
   - 模型架构：CNN、RNN、Transformer、GNN、Diffusion Model 等
   - 语言模型：GPT、BERT、LLaMA、GLM、Qwen 等
   - 多模态模型：CLIP、DALL-E、GPT-4V、Gemini 等
   - 应用技术：RAG、Fine-tuning、Prompt Engineering、LoRA 等
   - 表示学习：Word2Vec、Embedding、对比学习、流形学习等
   - 训练技术：预训练、微调、RLHF、DPO、知识蒸馏等
   - 计算机视觉：图像分类、目标检测、图像分割、OCR 等
   - 自然语言处理：分词、命名实体识别、机器翻译、文本生成等
   - 语音技术：ASR、TTS、语音克隆等
   - 应用领域：医疗AI、自动驾驶、金融AI、教育AI等
   - 前沿方向：AGI、世界模型、AI Agent、具身智能等
   - 工程实践：模型部署、推理优化、MLOps、数据工程等
   - 工具框架：PyTorch、TensorFlow、HuggingFace、LangChain 等
   - 硬件基础：GPU、TPU、分布式训练、混合精度等
   - AI安全：对齐、可解释性、隐私保护、对抗攻击等
   - 里程碑：ImageNet、AlphaGo、ChatGPT、GPT-4 等
   - 应用产品：ChatGPT、Midjourney、Copilot、Sora 等
3. 为每个实体评估重要性评分（1-5）：
   - 5分： foundational/核心基础概念，如 Transformer、深度学习
   - 4分：重要概念或技术，如 ResNet、BERT
   - 3分：常用技术或工具，如 LoRA、LangChain
   - 2分：辅助性概念，如 数据增强、学习率调度
   - 1分：细节性概念，如 具体的损失函数变体
4. 为每个实体撰写简洁准确的描述（1-3句话）

### 关系抽取规则
1. 识别实体之间的语义关系
2. 关系类型包括但不限于：
   - 包含：A 是 B 的组成部分
   - 基于：A 的设计基于 B
   - 使用：A 使用了 B 技术/方法
   - 属于：A 属于 B 类别
   - 改进：A 是对 B 的改进
   - 应用于：A 技术应用于 B 领域
   - 演化为：A 发展演化为 B
   - 对比：A 与 B 具有对比关系
   - 依赖：A 的实现依赖 B
   - 替代：A 在某些场景下替代了 B
3. 为每条关系评估置信度（0-1）：
   - 0.9-1.0：文本中明确表述的关系
   - 0.7-0.9：可以从文本中合理推断的关系
   - 0.5-0.7：基于领域知识的合理推测
   - 低于 0.5 的关系不应抽取

### 注意事项
1. 只抽取文本中明确提及或有充分依据的实体和关系
2. 实体名称应使用中文领域内通用的标准名称
3. 避免抽取过于宽泛或过于细粒度的实体
4. 同一实体在文本中可能有不同的表述方式，应合并为同一个实体
5. 如果文本中没有可抽取的有效实体，返回空列表

## 输出格式

请严格按照以下 JSON 格式输出，不要输出任何其他内容：

```json
{
  "entities": [
    {
      "name": "实体名称",
      "category": "分类名称",
      "description": "实体的简要描述",
      "importance": 4
    }
  ],
  "relations": [
    {
      "source": "源实体名称",
      "target": "目标实体名称",
      "relation": "关系类型",
      "description": "关系的简要说明",
      "confidence": 0.9
    }
  ]
}
```

请确保输出的 JSON 格式正确且可解析。
```

### 调用示例

**用户输入 (User Message):**

```
请从以下学习笔记中抽取知识实体和关系：

# Transformer 架构详解

Transformer 是一种基于自注意力机制（Self-Attention）的神经网络架构，由 Vaswani 等人在 2017 年的论文 "Attention Is All You Need" 中提出。它完全抛弃了传统的 RNN 和 CNN 结构，仅使用注意力机制来建模序列数据中的依赖关系。

Transformer 的核心组件包括：
- 多头自注意力机制（Multi-Head Self-Attention）
- 位置编码（Positional Encoding）
- 前馈神经网络（Feed-Forward Network）
- 层归一化（Layer Normalization）

GPT 和 BERT 都是基于 Transformer 架构的语言模型。GPT 使用 Transformer 的解码器部分，采用自回归方式进行文本生成；BERT 使用 Transformer 的编码器部分，通过掩码语言模型（MLM）进行预训练。
```

**LLM 输出示例:**

```json
{
  "entities": [
    {
      "name": "Transformer",
      "category": "模型架构",
      "description": "一种基于自注意力机制的神经网络架构，完全抛弃传统 RNN 和 CNN 结构，使用注意力机制建模序列依赖关系。",
      "importance": 5
    },
    {
      "name": "自注意力机制",
      "category": "核心领域",
      "description": "Transformer 的核心机制，通过计算序列中每个元素与其他所有元素的关联度来捕获依赖关系。",
      "importance": 5
    },
    {
      "name": "多头自注意力机制",
      "category": "核心领域",
      "description": "自注意力机制的扩展，通过多个注意力头并行计算，捕获不同子空间中的信息。",
      "importance": 4
    },
    {
      "name": "位置编码",
      "category": "核心领域",
      "description": "为 Transformer 中的输入序列注入位置信息，弥补自注意力机制无法感知顺序的不足。",
      "importance": 4
    },
    {
      "name": "GPT",
      "category": "语言模型",
      "description": "基于 Transformer 解码器的自回归语言模型，用于文本生成任务。",
      "importance": 5
    },
    {
      "name": "BERT",
      "category": "语言模型",
      "description": "基于 Transformer 编码器的语言模型，通过掩码语言模型进行预训练，广泛用于 NLP 下游任务。",
      "importance": 5
    },
    {
      "name": "掩码语言模型",
      "category": "训练技术",
      "description": "BERT 的预训练任务，随机遮蔽输入中的部分 token 并要求模型预测被遮蔽的内容。",
      "importance": 4
    },
    {
      "name": "RNN",
      "category": "模型架构",
      "description": "循环神经网络，传统的序列建模架构，存在长距离依赖问题。",
      "importance": 3
    }
  ],
  "relations": [
    {
      "source": "Transformer",
      "target": "自注意力机制",
      "relation": "基于",
      "description": "Transformer 基于自注意力机制构建，完全抛弃了 RNN 和 CNN。",
      "confidence": 0.99
    },
    {
      "source": "Transformer",
      "target": "多头自注意力机制",
      "relation": "包含",
      "description": "多头自注意力机制是 Transformer 的核心组件之一。",
      "confidence": 0.98
    },
    {
      "source": "Transformer",
      "target": "位置编码",
      "relation": "包含",
      "description": "位置编码是 Transformer 的核心组件之一，用于注入序列位置信息。",
      "confidence": 0.98
    },
    {
      "source": "GPT",
      "target": "Transformer",
      "relation": "基于",
      "description": "GPT 基于 Transformer 的解码器部分构建。",
      "confidence": 0.99
    },
    {
      "source": "BERT",
      "target": "Transformer",
      "relation": "基于",
      "description": "BERT 基于 Transformer 的编码器部分构建。",
      "confidence": 0.99
    },
    {
      "source": "BERT",
      "target": "掩码语言模型",
      "relation": "使用",
      "description": "BERT 通过掩码语言模型（MLM）进行预训练。",
      "confidence": 0.99
    },
    {
      "source": "Transformer",
      "target": "RNN",
      "relation": "替代",
      "description": "Transformer 在序列建模任务中替代了传统的 RNN 结构。",
      "confidence": 0.90
    }
  ]
}
```

---

## 4. 飞书应用配置说明

### 4.1 创建飞书应用

1. 访问 [飞书开放平台](https://open.feishu.cn/) 并使用飞书账号登录
2. 点击「创建企业自建应用」
3. 填写应用信息：
   - **应用名称**：AI 知识图谱（或自定义名称）
   - **应用描述**：AI 知识图谱数据管理与同步工具
   - **应用图标**：上传合适的图标
4. 创建完成后进入应用详情页

### 4.2 获取应用凭证

在应用详情页的「凭证与基础信息」页面中，可以找到：

| 凭证 | 说明 | 示例 |
|------|------|------|
| App ID | 应用唯一标识 | `cli_a5xxxxxxxxxxxxx` |
| App Secret | 应用密钥，用于获取 access_token | `xxxxxxxxxxxxxxxxxxxxxxxx` |

> **安全提示**：App Secret 请妥善保管，不要泄露或提交到代码仓库中。建议使用环境变量或密钥管理服务存储。

### 4.3 配置应用权限

在「权限管理」页面中，申请以下权限：

#### 必需权限

| 权限标识 | 权限名称 | 用途说明 |
|----------|----------|----------|
| `bitable:app` | 查看、编辑和管理多维表格 | 读写多维表格数据 |
| `bitable:app:readonly` | 查看多维表格 | 读取多维表格数据 |
| `docx:document:readonly` | 查看飞书文档 | 读取文档内容进行知识抽取 |
| `wiki:wiki:readonly` | 查看知识库 | 读取知识库文档内容 |
| `drive:drive:readonly` | 查看云空间中的文件 | 访问飞书云空间中的文档 |

#### 可选权限

| 权限标识 | 权限名称 | 用途说明 |
|----------|----------|----------|
| `bitable:app` | 管理多维表格 | 创建和管理多维表格结构 |
| `notification:push` | 发送应用内通知 | 处理完成时通知用户 |
| `im:message:send_as_bot` | 以应用身份发送消息 | 通过机器人推送处理结果 |

### 4.4 权限申请与审批流程

1. 在权限管理页面搜索并申请上述权限
2. 对于需要审批的权限，提交审批申请
3. 等待企业管理员审批通过
4. 权限生效后，应用即可调用对应的 API

### 4.5 发布应用

1. 在「版本管理与发布」页面创建版本
2. 填写版本号和更新说明
3. 提交发布申请
4. 管理员审核通过后，应用即可正常使用

### 4.6 环境变量配置

在后端项目中，需要配置以下环境变量：

```bash
# 飞书应用凭证
FEISHU_APP_ID=cli_a5xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx

# 多维表格配置
FEISHU_BITABLE_APP_TOKEN=bascnxxxxxxxxxx
FEISHU_BITABLE_TABLE_NODES=tblxxxxxxxxxx    # 知识节点表 ID
FEISHU_BITABLE_TABLE_RELATIONS=tblxxxxxxxxxx # 知识关系表 ID
FEISHU_BITABLE_TABLE_DOCS=tblxxxxxxxxxx      # 文档队列表 ID
FEISHU_BITABLE_TABLE_CATEGORIES=tblxxxxxxxxxx # 分类配置表 ID

# LLM API 配置
LLM_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
LLM_API_BASE=https://api.openai.com/v1
LLM_MODEL=gpt-4o

# 同步配置
SYNC_INTERVAL=300  # 同步间隔（秒）
```

### 4.7 获取多维表格和表 ID

1. 打开飞书多维表格
2. 从浏览器地址栏获取 `app_token`：
   ```
   https://xxx.feishu.cn/base/bascnXXXXXXXXXXXX?table=tblXXXXXXXXXXXX
                                ^^^^^^^^^^^^^^^^
                                app_token
   ```
3. 切换到对应的数据表，从 URL 中获取 `table_id`：
   ```
   https://xxx.feishu.cn/base/bascnXXXXXXXXXXXX?table=tblXXXXXXXXXXXX
                                                        ^^^^^^^^^^^^^^^^
                                                        table_id
   ```

### 4.8 API 调用流程

```
1. 使用 App ID + App Secret 获取 tenant_access_token
   POST https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal

2. 使用 token 调用多维表格 API
   # 读取记录
   GET https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records

   # 写入记录
   POST https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records

   # 更新记录
   PUT https://open.feishu.cn/open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/{record_id}

3. 使用 token 调用文档 API
   GET https://open.feishu.cn/open-apis/docx/v1/documents/{document_id}/raw_content
```

---

## 附录

### A. 飞书 Bitable API 字段类型映射

| 飞书字段类型 | API 中的 type 值 | JSON 数据格式 |
|-------------|-----------------|---------------|
| 文本 | 1 | `{"type": 1, "text": "内容"}` |
| 数字 | 2 | `{"type": 2, "value": 42}` |
| 单选 | 3 | `{"type": 3, "value": "选项名"}` |
| 多选 | 4 | `{"type": 4, "value": ["选项1", "选项2"]}` |
| 日期 | 5 | `{"type": 5, "value": 1712649600000}` (毫秒时间戳) |
| 复选框 | 7 | `{"type": 7, "value": true}` |
| 超链接 | 15 | `{"type": 15, "value": {"link": "https://...", "text": "显示文本"}}` |
| 关联 | 17 | `{"type": 17, "value": ["record_id_1", "record_id_2"]}` |
| 多行文本 | 1 | `{"type": 1, "text": "多行\n文本内容"}` |

### B. 参考链接

- [飞书开放平台文档](https://open.feishu.cn/document/)
- [多维表格 API](https://open.feishu.cn/document/server-docs/docs/bitable-v1/app-table-record)
- [飞书文档 API](https://open.feishu.cn/document/server-docs/docs/docx-v1/document/raw_content)
- [权限列表](https://open.feishu.cn/document/server-docs/permission-v3/permission/list)
