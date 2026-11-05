// 视图配置快照（JSON 导入/导出）的编码与字段校验工具。
// 设计原则：导入是"尽力而为"——逐字段校验类型与范围，非法字段回退到当前值，绝不抛出。

export const SNAPSHOT_VERSION = 1

/** 编码为 JSON 文本（带版本号与视图标识） */
export function encodeSnapshot(view: string, data: Record<string, unknown>): string {
  return JSON.stringify({ v: SNAPSHOT_VERSION, view, ...data }, null, 2)
}

/** 解码并校验快照；版本或视图不匹配、JSON 非法时返回 null */
export function decodeSnapshot(text: string, expectedView: string): Record<string, unknown> | null {
  try {
    const o = JSON.parse(text) as unknown
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null
    const rec = o as Record<string, unknown>
    if (rec.v !== SNAPSHOT_VERSION || rec.view !== expectedView) return null
    return rec
  } catch {
    return null
  }
}

/** 读取有限数值字段并夹到 [min, max]，非法回退 fallback */
export function num(o: Record<string, unknown>, key: string, fallback: number, min = -Infinity, max = Infinity): number {
  const v = o[key]
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** 读取字符串字段；allowed 给出时仅接受其中之一 */
export function str(o: Record<string, unknown>, key: string, fallback: string, allowed?: readonly string[]): string {
  const v = o[key]
  if (typeof v !== 'string') return fallback
  if (allowed && !allowed.includes(v)) return fallback
  return v
}

/** 读取布尔字段 */
export function bool(o: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = o[key]
  return typeof v === 'boolean' ? v : fallback
}

/** 读取二元数值组（如观察窗 [起, 止]） */
export function numArray2(o: Record<string, unknown>, key: string, fallback: [number, number]): [number, number] {
  const v = o[key]
  if (!Array.isArray(v) || v.length !== 2) return fallback
  const a = typeof v[0] === 'number' ? v[0] : NaN
  const b = typeof v[1] === 'number' ? v[1] : NaN
  if (!isFinite(a) || !isFinite(b)) return fallback
  return [a, b]
}

/** 读取三元数值组（如系统系数 [b2,b1,b0]） */
export function numTuple3(
  o: Record<string, unknown>,
  key: string,
  fallback: [number, number, number],
): [number, number, number] {
  const v = o[key]
  if (!Array.isArray(v) || v.length !== 3) return fallback
  const a = v.map((x) => (typeof x === 'number' && isFinite(x) ? x : NaN))
  if (a.some((x) => !isFinite(x))) return fallback
  return [a[0], a[1], a[2]]
}

/** 读取参数对象：仅保留 keys 中出现且为有限数的字段，缺省回退到 fallback 中对应值 */
export function numRecord(
  o: Record<string, unknown>,
  key: string,
  keys: readonly string[],
  fallback: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = { ...fallback }
  const v = o[key]
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  const rec = v as Record<string, unknown>
  for (const k of keys) {
    const x = rec[k]
    if (typeof x === 'number' && isFinite(x)) out[k] = x
  }
  return out
}

/**
 * 把"会被预设副作用覆盖"的赋值推迟到下一个宏任务：
 * 视图中 setPresetId 会触发 [presetId] effect 重设表达式/参数，
 * 先让该 effect 跑完，再应用导入值，保证自定义表达式不被预设冲掉。
 */
export function deferApply(fn: () => void): void {
  window.setTimeout(fn, 0)
}
