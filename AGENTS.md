# llm-wiki AGENTS.md

## 项目概述

AI 驱动的个人知识库 Web App：前端 React 19 + Zustand 5，后端 Express 5 + PostgreSQL + Drizzle ORM。

支持将本地文档/源码通过 LLM 转化为结构化 wiki，并提供知识图谱可视化、向量语义检索、多模态摄取等能力。

## 关键目录

| 目录 | 说明 |
|---|---|
| `src/` | 前端（React 19 / Vite 8） |
| `server/src/` | 后端（Express 5 / Node.js） |
| `shared/` | 前后端共享类型（**单一来源，禁止重复定义**） |
| `server/src/services/ingest-service.ts` | 核心服务：LLM 内容生成与写文件（约 2400 行，正在拆分） |
| `server/src/lib/llm-client.ts` | 统一 LLM 流式调用入口（重构后） |
| `server/src/lib/llm-providers.ts` | 各 LLM provider 配置（OpenAI / Anthropic / Google / Ollama 等） |
| `server/src/db/schema.ts` | Drizzle ORM 数据库 schema |
| `server/src/db/migrations/` | SQL 迁移文件 |
| `.cursor/rules/` | Cursor AI 编码规则（8 个，覆盖架构、测试、路由、状态管理等） |

## 开发命令

```bash
npm run dev:all              # 同时启动前后端
npm run dev                  # 仅前端（Vite）
npm run dev:server           # 仅后端（tsx watch）

npm test                     # 前端测试（Vitest）
npm --prefix server test     # 后端测试（Vitest）

npm run test:ingest-regression   # ingest 回归测试
npm run test:status-sync         # 状态同步测试
npm run test:consistency         # 内容一致性测试

npm run typecheck            # 前端类型检查
npm run typecheck:server     # 后端类型检查
```

## 架构不变量（修改代码前必读）

1. **路径安全**：前端永不持有绝对文件路径；服务端路径必须经过 `path-sandbox.ts` 校验
2. **任务 ID**：用 `randomUUID()`（from `node:crypto`），禁止 `Date.now()` + `Math.random()` 组合
3. **共享类型**：`ServerIngestTask`、`FileNode`、`WikiProject` 等定义在 `shared/types.ts`，禁止前后端重复定义
4. **LLM 写文件三道门**：路径白名单 → title-filename 一致性 → 内容语义一致性（可用 `LLM_WIKI_SKIP_VALIDATION=1` 临时禁用）
5. **SSE 安全**：token 在 `Authorization: Bearer <jwt>` header，禁止放 URL query param

## 已知技术债（改造进行中）

| 编号 | 位置 | 问题 | 改造方案 |
|---|---|---|---|
| A | `ingest-service.ts` / `research-service.ts` | 任务状态存内存 Map，重启丢失 | 迁移到 PostgreSQL `ingest_tasks` / `research_tasks` 表 |
| B | `server/src/routes/ingest.ts` | `/stream/:taskId` 用 GET，JWT 只能放 URL | 改为 POST + Authorization header |
| C | `ingest-service.ts` / `research-service.ts` | LLM 调用逻辑重复内联 | 提取 `server/src/lib/llm-client.ts` 统一入口 |
| D | `ingest-service.ts` | 无并发控制，多任务同时运行可能超负荷 | 新建 `ingest-queue.ts` Semaphore 队列 |
| E | `server/src/services/vector-service.ts` | 向量数据存文件系统 | 迁移到 `pgvector` PostgreSQL 扩展 |
| F | `src/stores/wiki-store.ts` | 服务端配置（llmConfig 等）混入 Zustand persist | 分离 `ui-store.ts` + TanStack Query hooks |
| G | `ingest-service.ts:writeSingleBlock` | title 一致性和语义一致性校验已注释 | 恢复并加 `LLM_WIKI_SKIP_VALIDATION` 开关 |

## 测试约定

- 后端测试 mock 必须在 import 前声明（见 `.cursor/rules/test-conventions.mdc`）
- 每个 service 测试必须 mock：`node:fs/promises`、`fetch`、`../state-service.js`
- 用 `beforeEach(() => vi.clearAllMocks())` 隔离测试间状态
