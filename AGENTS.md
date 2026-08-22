# AGENTS.md — dsh-version

dsh Web GUI 的 DSH 版本查看插件：面板只展示两个数字——**本地 DSH 版本**
（当前客户端运行的 `@deepseek-ai/dsh` 核心）与**最新版本**（以 GitHub
Releases 为准——dsh 的 rc 版本发布在 npm `next` 标签下而 `latest` 常滞后；
GitHub 不可达时回退 npm dist-tags，默认每 3 小时自动轮询，可配置）。提供
「立即检查」与「更新」按钮——更新把 profile 中的 dsh / dsh-base /
dsh-web-app 核心三件升到检测到的最新版本。

本仓库是独立仓库：构建/测试/类型检查都从仓库根直接运行（无 pnpm workspace，
`shared/` 下的 tsdown 预设与 web-platform.ts 是本仓库自带的构建资产）。

## 安全模型（本包最重的纪律）

- 更新会**真实改写** `~/.dsh/<profile>` 的依赖安装（`pnpm add …@<版本>`），
  按钮两步确认即用户同意；`/api/dsh-version/*` 全部仅限 loopback（同机浏览器
  与同源标记，遵循 loopback 围栏——RFC 5735 127/8、::1、IPv4-mapped，
  Host 头与浏览器同源标记；X-Forwarded-For 永不采信）。
- 更新完成后需要重启 `dsh web` 才生效——面板必须明确提示，工具/按钮不得谎称
  「已生效」。
- 最新版本数据来自 GitHub Releases API（回退公开 npm dist-tags）；任一来源
  失败时保留旧值并把最新版本显示为 `--`，绝不静默吞掉查找失败。

## 运行时契约

- host 半场版本探测锚定**插件自身所在树**（profile node_modules），并通过
  `~/.dsh/profiles` 下声明了本插件依赖的 profile 兜底定位（对 `link:` 挂载的
  symlink 免疫），保证「本地版本」= GUI 实际运行的 SDK。
- 轮询器、路由、系统提示三段都挂在 `ctx.effect` 上，配置变更（设置面板）会
  整体重挂；`mountOnce` 防止同一包双实例重复注册。
- 更新执行器优先 pnpm（PATH 探测，`--config.minimumReleaseAge=0` 绕过 pnpm
  的 24 小时新版本门槛），回退 npm；registry 固定官方 npm registry
  （`https://registry.npmjs.org/`），镜像源会漏掉新发布的 rc。输出不流入面板
  （面板只展示成败结果）。

## 发布与安装契约

- git 安装（`dsh plugin add github:MrWinchester/dsh-version-control`）分发
  的是**源码**不是构建产物，`prepare` 脚本（`tsdown`）在安装时自包含构建：
  不得依赖仓库外路径（`shared/` 与此仓库同在），devDependencies 由 pnpm
  安装。改动构建链路时必须保证 `prepare` 依然只靠本仓库 + devDependencies
  即可产出 `lib/index.js` 与 `lib/client.js`。
- `prepare` 刻意不做类型检查（tsdown 转译），因此 git 安装出的 `lib/` 不含
  d.ts；完整类型（`lib/types`）只在 npm 发布（`pnpm build` = tsc 声明 +
  tsdown）时产出。
- pnpm ≥ 10 需用户先在 profile 的 `pnpm-workspace.yaml` 里 `allowBuilds`
  授权后才执行 git 依赖的 `prepare`；README 已写明该流程，勿在文档中省略。
- 本仓库根自带 `pnpm-workspace.yaml`（`allowBuilds: esbuild`）：pnpm 对
  git-hosted 包在跑 `prepare` 前会先在其包目录内执行一次隔离的
  `pnpm install`（该目录即工作区根，不继承安装方 profile 的 allowBuilds，
  `strictDepBuilds` 下会因 esbuild 构建脚本被忽略而失败）。此文件是源码
  安装开箱即用的前提，勿删除。

## 包名与改名

安装身份是 `@mrwinchester/dsh-version`（npm scope 强制小写，GitHub 用户名
MrWinchester 与包名独立）。包名散布在多个文件中——改名必须全量同步，缺一
处就会让 profile 依赖与插件张挂失配：

- `package.json` 的 `name`
- `src/index.ts`：`PLUGIN_PACKAGE` 常量与 `mountOnce` 的包名实参
- `cordis.patch.yml` 的插件行 `name`
- `tsdown.config.ts` 的 `clientBundle` 第一个参数（id 会打进
  `__ModuleLoader__.load` 与 style 标签）
- `tests/versions.test.ts` 的 fixture 依赖名（含对照包名）
- 本文件与两份 README 中的安装身份 / `allowBuilds` key

改名后需在已挂载 profile 中重装（`remove` 旧包名 + `add` 新包名）。

## 提交前检查

```sh
pnpm test          # versions/helpers/store 单测
pnpm typecheck
pnpm build         # tsc 声明 + tsdown 双面产物（node lib + client bundle）
```