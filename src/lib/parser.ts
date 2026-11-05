// 受限数学表达式解析器 —— 基于 mathjs 的表达式语言（非 eval，不执行任意 JS）
import { create, all } from 'mathjs'

const math = create(all)

export type Domain = 'ct' | 'dt'

/** 全部可调参数（滑杆） */
export type Params = {
  a: number
  b: number
  f0: number
  w0: number
  tau: number
  t0: number
  L: number
}

export const PARAM_KEYS = ['a', 'b', 'f0', 'w0', 'tau', 't0', 'L'] as const
export type ParamKey = (typeof PARAM_KEYS)[number]

export const DEFAULT_PARAMS: Params = { a: 1, b: 3, f0: 1, w0: 2, tau: 1, t0: 0, L: 8 }

const COMPLEX_I = math.complex(0, 1)

/** 连续时间作用域辅助函数：u(t)=阶跃, rect, tri, sinc(归一化), sa(t)=sin t/t, sgn */
const ctScopeBase: Record<string, unknown> = {
  u: (t: number) => (t >= 0 ? 1 : 0),
  step: (t: number) => (t >= 0 ? 1 : 0),
  rect: (t: number) => (Math.abs(t) <= 0.5 + 1e-12 ? 1 : 0),
  tri: (t: number) => {
    const s = Math.abs(t)
    return s < 1 ? 1 - s : 0
  },
  sinc: (t: number) => (t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t)),
  sa: (t: number) => (t === 0 ? 1 : Math.sin(t) / t),
  sgn: (t: number) => (t > 0 ? 1 : t < 0 ? -1 : 0),
  j: COMPLEX_I,
}

/** 离散时间作用域：u[n], delta[n]=δ[n], sinc[n], sa[n] */
const dtScopeBase: Record<string, unknown> = {
  u: (n: number) => (n >= 0 ? 1 : 0),
  delta: (n: number) => (n === 0 ? 1 : 0),
  rect: (n: number) => (Math.abs(n) <= 0.5 ? 1 : 0),
  sinc: (n: number) => (n === 0 ? 1 : Math.sin(Math.PI * n) / (Math.PI * n)),
  sa: (n: number) => (n === 0 ? 1 : Math.sin(n) / n),
  sgn: (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0),
  j: COMPLEX_I,
}

export type CompiledExpr = { evaluate: (scope: Record<string, unknown>) => unknown }

export type CompileResult =
  | { ok: true; compiled: CompiledExpr; symbols: string[] }
  | { ok: false; error: string }

function cleanErr(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  return m.replace(/^\(char \d+\)\s*/, '')
}

/** 编译用户表达式（语法检查 + 未定义符号检查）。不做任何 JS eval。 */
export function compileSignal(expr: string): CompileResult {
  try {
    const node = math.parse(expr)
    const symbols = node
      .filter((n) => (n as unknown as { isSymbolNode?: boolean }).isSymbolNode)
      .map((n) => (n as unknown as { name: string }).name)
    const compiled = node.compile()
    // 冒烟测试：捕获未定义符号等错误
    const scope: Record<string, unknown> = {
      ...ctScopeBase,
      ...dtScopeBase,
      t: 0.1234,
      n: 2,
      ...DEFAULT_PARAMS,
    }
    try {
      compiled.evaluate(scope)
    } catch (e) {
      const msg = cleanErr(e)
      if (/Undefined symbol/i.test(msg)) return { ok: false, error: msg }
      // 其它运行时错误（如除零）不算失败，采样时会按 NaN 处理
    }
    return { ok: true, compiled: compiled as unknown as CompiledExpr, symbols }
  } catch (e) {
    return { ok: false, error: cleanErr(e) }
  }
}

export type SampleFn = (x: number) => { re: number; im: number }

function toCx(v: unknown): { re: number; im: number } {
  if (typeof v === 'number') return { re: v, im: 0 }
  if (typeof v === 'boolean') return { re: v ? 1 : 0, im: 0 }
  if (v && typeof v === 'object') {
    const o = v as { re?: unknown; im?: unknown }
    if (typeof o.re === 'number' && isFinite(o.re)) {
      const im = typeof o.im === 'number' && isFinite(o.im) ? o.im : 0
      return { re: o.re, im }
    }
  }
  return { re: NaN, im: NaN }
}

/** 构造采样函数 f(t) 或 f[n]，复数结果保留 re/im */
export function makeSampler(compiled: CompiledExpr, domain: Domain, params: Params): SampleFn {
  const scope: Record<string, unknown> = {
    ...(domain === 'ct' ? ctScopeBase : dtScopeBase),
    ...params,
  }
  const varName = domain === 'ct' ? 't' : 'n'
  return (x: number) => {
    scope[varName] = x
    let v: unknown
    try {
      v = compiled.evaluate(scope)
    } catch {
      return { re: NaN, im: NaN }
    }
    return toCx(v)
  }
}

/** 表达式中实际用到的参数名（用于只显示相关滑杆） */
export function usedParams(symbols: string[]): ParamKey[] {
  const set = new Set(symbols)
  return PARAM_KEYS.filter((k) => set.has(k))
}

export const SIGNAL_HELP = [
  '函数: u( ) 阶跃 · rect( ) 矩形 · tri( ) 三角 · sinc( ) · sa( )=sin·t/t · sgn( )',
  '运算: exp sin cos tan sqrt abs log pow ^ * / + - 括号 · 复数 j 或 i',
  '常量: pi · e · 参数: a b f0 w0 tau t0 L（左侧滑杆调节）',
]
