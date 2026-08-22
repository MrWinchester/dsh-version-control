# dsh-version

DSH（DeepSeek Harness）Web GUI 的版本查看与更新插件：侧边栏面板展示两个数字
——**本地 DSH 版本**（当前客户端实际运行的 `@deepseek-ai/dsh` 核心）与
**最新发布版本**（以 GitHub Releases 为准，npm dist-tags 兜底），按可配置
间隔（默认每 3 小时）自动轮询，并提供「立即检查」与「更新」按钮——更新把
profile 中的核心三件（dsh / dsh-base / dsh-web-app）升到检测到的最新版本。

热插拔安装——通过 `dsh plugin --profile <name> add link:<路径>` 挂载，
不改 dsh 源码。

## 功能

- **本地版本**：从 GUI 实际运行的依赖树（profile npm 安装）探测，保证数字
  与运行中的 SDK 一致。
- **最新版本**：从 dsh 的 GitHub Releases API
  （`repos/deepseek-ai/deepseek-harness/releases`）拉取；GitHub 不可达时
  改用 npm `latest`/`next` dist-tags 中较高者（`…/-/package/@deepseek-ai/dsh/dist-tags`）
  ——rc 版本发布在 `next` 下，`latest` 常滞后。按可配置间隔缓存（默认 3 小时，
  范围 1 分钟 ~ 1 周，可在设置 → 插件 → dsh-version 中调整），另有「立即
  检查」按钮。
- **更新按钮**：两步确认（不弹独立对话框）；按检测到的版本执行 `pnpm add
  @deepseek-ai/dsh@<版本> @deepseek-ai/dsh-base@<版本>
  @deepseek-ai/dsh-web-app@<版本>`（无 pnpm 时回退 npm），结果显示为
  成功/失败横幅。**更新后需重启 `dsh web` 生效。**
- **仅 loopback 的 API**：`/api/dsh-version/*` 只能从本机访问，绝不暴露到
  局域网。

## 环境要求

- 一个运行中的 DSH Web GUI 部署（`dsh web`，或 `pnpm --profile web`），
  且存在 `~/.dsh/profiles/<name>` 安装。
- Node.js `^22.19.0 || >=24.0.0`（仅从源码构建时需要；插件本身运行在 dsh
  host 内）。
- 更新执行器优先使用 `PATH` 上的 `pnpm`（无 pnpm 时回退 npm）。

## 安装

```sh
# 在能访问本源码树的本机任意目录执行
dsh plugin --profile web add link:/path/to/dsh-version-control
# 重启 dsh web 加载插件
```

重启后在 Web GUI 侧边栏出现「DSH 版本」入口。bundle 补丁
（`cordis.patch.yml`）与 `package.json` 里的 `dsh.client` 声明会让宿主与
浏览器两半自动加载。

卸载：

```sh
dsh plugin --profile web remove dsh-version
```

## 使用

1. 打开 Web GUI，点击侧边栏「DSH 版本」入口打开面板。
2. 面板展示本地版本、最新版本、上次检查时间与轮询间隔。
3. 点击**立即检查**强制重新查询 GitHub Releases / npm。
4. 检测到新版本后点击**更新**并按两步确认。插件在 profile 目录内运行包管理器，
   以横幅展示成败。**完成后重启 `dsh web`。**

## API

所有路由仅限 loopback，返回 JSON。

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/dsh-version/status` | 本地/最新版本、检查状态、轮询配置、更新状态 |
| `POST` | `/api/dsh-version/refresh` | 立即触发一次版本检查 |
| `POST` | `/api/dsh-version/update` | 开始 profile 更新（仅 loopback） |

## 配置

插件读取 `dsh-version` settings 命名空间（设置 → 插件 → dsh-version）：

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `checkIntervalMinutes` | number | `180` | 轮询间隔（分钟，1 ~ 10080）。变更后运行中的轮询器自动重挂。 |
| `announceToAgent` | boolean | `true` | 是否在系统提示中向 agent 声明本插件。 |
| `enabled` | boolean | `true` | 路由、轮询器与提示段的总开关。 |

## 安全模型

- 更新会**真实改写** `~/.dsh/<profile>` 的依赖安装（`pnpm add …@<版本>`），
  按钮两步确认即用户同意。
- `/api/dsh-version/*` 全部仅限 loopback：校验 socket 地址、`Host` 头与
  浏览器同源标记，`X-Forwarded-For` 永不采信。
- 版本查询绝不静默吞错：GitHub Releases 与 npm dist-tags 均失败时保留旧值，
  最新版本显示 `--` 并附失败提示。

## 开发

```sh
pnpm install         # 安装 devDependencies（官方 @deepseek-ai SDK 包）
pnpm test            # vitest：versions/helpers/store 单测
pnpm typecheck       # tsc --noEmit
pnpm build           # tsc 声明 + tsdown 双面产物（lib/ + lib/client.js）
```

构建自包含：类型解析自 `devDependencies` 中声明的官方 `@deepseek-ai/*` npm
SDK 包，不依赖 DSH 源码检出。`shared/` 目录（tsdown 客户端预设 +
`web-platform.ts`）为独立构建而随仓库携带。

### 目录结构

```
src/                    宿主半场：版本探测、registry 轮询、路由、更新执行器
src/client/             浏览器半场：侧边栏入口 + 版本面板（Web GUI）
src/protocol.ts         两半共享的协议线（wire contract）
src/loopback.ts         loopback 信任围栏（与 dsh-web-ui 全家桶共享）
src/mount-once.ts       单实例守卫
tests/                  单测（无框架依赖的版本助手、store）
shared/                 随仓携带的 tsdown 客户端构建预设 + 平台模块表
cordis.patch.yml        把插件行插入 profile 的 bundle 补丁
```

### 包名与改名

安装身份是 `@linxin666/dsh-version`。改名必须同步三处：`src/index.ts`
（`PLUGIN_PACKAGE`）、`cordis.patch.yml`（插件行）、`tsdown.config.ts`
（`clientBundle` 的 id）。

## License

Apache-2.0 —— 见 [LICENSE](LICENSE)。