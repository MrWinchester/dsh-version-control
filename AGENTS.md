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

## 包名与改名

安装身份是 `@linxin666/dsh-version`。改名必须同步三处：`src/index.ts` 的
`PLUGIN_PACKAGE`、`cordis.patch.yml` 的插件行、`tsdown.config.ts` 的
`clientBundle` 第一个参数（client bundle id 会打进 `__ModuleLoader__.load`
与 style 标签）。

## 提交前检查

```sh
pnpm test          # versions/helpers/store 单测
pnpm typecheck
pnpm build         # tsc 声明 + tsdown 双面产物（node lib + client bundle）
```