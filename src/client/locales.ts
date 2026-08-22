/**
 * dsh-version surface copy: zh is the key source, en mirrors every key.
 */

export const zh = {
  'entry.label': 'DSH 版本',
  'entry.tooltip': '查看 DSH 版本与检查更新',
  'panel.title': 'DSH 版本',
  'panel.backToConversation': '返回会话',
  'local.label': '本地 DSH 版本',
  'local.hint': '当前客户端运行的核心',
  'latest.label': '最新版本',
  'latest.hint': 'GitHub Releases 已发布',
  'toolbar.refresh': '立即检查',
  'checking': '检查中…',
  'toolbar.update': '更新',
  'toolbar.updateConfirm': '确认更新？',
  'toolbar.updating': '更新中…',
  'toolbar.updateDisabledHint': '已是最新，或缺少更新条件',
  'update.done': '更新完成，请重启 dsh web 生效。',
  'update.failed': '更新失败：{error}',
  'status.upToDate': '已是最新',
  'status.outOfDate': '有新版本',
  'status.unknown': '未知',
  'summary.lastChecked': '上次检查：{time}',
  'summary.neverChecked': '尚未检查',
  'summary.interval': '自动检查：每 {minutes} 分钟',
  'summary.intervalOff': '自动检查：未启用',
  'summary.intervalHint': '（可在设置 → 插件 → dsh-version 调整）',
  'summary.profileDir': '更新目标：{dir}',
  'summary.noProfile': '未检测到 profile 目录，更新不可用',
  'common.loading': '加载中…',
  'common.error': '出错了：{error}',
}

export const en = {
  'entry.label': 'DSH Version',
  'entry.tooltip': 'DSH version & update checker',
  'panel.title': 'DSH Version',
  'panel.backToConversation': 'Back to conversation',
  'local.label': 'Local DSH version',
  'local.hint': 'the running client core',
  'latest.label': 'Latest version',
  'latest.hint': 'published on GitHub Releases',
  'toolbar.refresh': 'Check now',
  'checking': 'Checking…',
  'toolbar.update': 'Update',
  'toolbar.updateConfirm': 'Confirm update?',
  'toolbar.updating': 'Updating…',
  'toolbar.updateDisabledHint': 'Up to date, or update is not applicable',
  'update.done': 'Update finished — restart dsh web to apply.',
  'update.failed': 'Update failed: {error}',
  'status.upToDate': 'Up to date',
  'status.outOfDate': 'Update available',
  'status.unknown': 'Unknown',
  'summary.lastChecked': 'Last check: {time}',
  'summary.neverChecked': 'Not checked yet',
  'summary.interval': 'Auto check: every {minutes} min',
  'summary.intervalOff': 'Auto check: off',
  'summary.intervalHint': '(adjustable in Settings → Plugins → dsh-version)',
  'summary.profileDir': 'Update target: {dir}',
  'summary.noProfile': 'No profile directory detected; update unavailable',
  'common.loading': 'Loading…',
  'common.error': 'Error: {error}',
}

/** Locale key union. */
export type VersionKey = keyof typeof zh

/** Tiny interpolation: {name} -> value. */
export function t(dictionary: Record<string, string>, key: string, values?: Record<string, string | number>): string {
  let text = dictionary[key] ?? key
  if (values !== undefined) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
  }
  return text
}