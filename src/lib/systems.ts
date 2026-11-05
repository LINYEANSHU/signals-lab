// 系统模型：传递函数、零极点、状态空间、RK4/递推仿真、ROC 与稳定性
import { cx, cAdd, cMul, polyRoots, polyEval, cDiv, type Cx } from './numeric'

/** 连续系统 H(s) = (b2 s² + b1 s + b0) / (a2 s² + a1 s + a0) */
export type CTSystem = { b: [number, number, number]; a: [number, number, number] }
/** 离散系统 H(z) = (b0 + b1 z⁻¹ + b2 z⁻²) / (1 + a1 z⁻¹ + a2 z⁻²) */
export type DTSystem = { b: [number, number, number]; a: [number, number] }

export function ctPoles(s: CTSystem): Cx[] {
  return polyRoots([cx(s.a[0]), cx(s.a[1]), cx(s.a[2])])
}

export function ctZeros(s: CTSystem): Cx[] {
  const [b2, b1, b0] = s.b
  if (b2 === 0 && b1 === 0 && b0 === 0) return []
  return polyRoots([cx(b2), cx(b1), cx(b0)])
}

export function dtPoles(s: DTSystem): Cx[] {
  return polyRoots([cx(1), cx(s.a[0]), cx(s.a[1])])
}

export function dtZeros(s: DTSystem): Cx[] {
  const [b0, b1, b2] = s.b
  if (b0 === 0 && b1 === 0 && b2 === 0) return []
  // 分子 b0 z² + b1 z + b2（z 正幂，最高次在前）
  return polyRoots([cx(b2), cx(b1), cx(b0)])
}

export function ctNumDenCx(s: CTSystem): { num: Cx[]; den: Cx[] } {
  return {
    num: [cx(s.b[0]), cx(s.b[1]), cx(s.b[2])],
    den: [cx(s.a[0]), cx(s.a[1]), cx(s.a[2])],
  }
}

export function ctFreqResp(s: CTSystem, w: number): Cx {
  const { num, den } = ctNumDenCx(s)
  const n = polyEval(num, cx(0, w))
  const d = polyEval(den, cx(0, w))
  const d2 = d.re * d.re + d.im * d.im
  if (d2 < 1e-10) return cx(0, 0) // jω 轴上有极点：限幅
  return cDiv(n, d)
}

export function dtFreqResp(s: DTSystem, w: number): Cx {
  const em = cx(Math.cos(w), -Math.sin(w))
  const em2 = cMul(em, em)
  const n = cAdd(cAdd(cx(s.b[0]), cMul(cx(s.b[1]), em)), cMul(cx(s.b[2]), em2))
  const d = cAdd(cAdd(cx(1), cMul(cx(s.a[0]), em)), cMul(cx(s.a[1]), em2))
  const d2 = d.re * d.re + d.im * d.im
  if (d2 < 1e-12) return cx(0, 0)
  return cDiv(n, d)
}

/* ---------------- 状态空间与连续时间仿真 ---------------- */

export type SS = {
  order: 1 | 2
  A: number[][]
  B: number[]
  C: number[]
  D: number
  improper: boolean
}

/** 能控标准型实现（a2≈0 时退化为一阶；b2≠0 且 a2≈0 视为非真分式） */
export function ctStateSpace(s: CTSystem): SS {
  const [b2, b1, b0] = s.b
  const [a2, a1, a0] = s.a
  if (Math.abs(a2) > 1e-12) {
    const D = b2 / a2
    return {
      order: 2,
      A: [
        [0, 1],
        [-a0 / a2, -a1 / a2],
      ],
      B: [0, 1],
      C: [(b0 - D * a0) / a2, (b1 - D * a1) / a2],
      D,
      improper: false,
    }
  }
  if (Math.abs(a1) > 1e-12) {
    const D = b1 / a1
    return {
      order: 1,
      A: [[-a0 / a1]],
      B: [1],
      C: [(b0 - D * a0) / a1],
      D,
      improper: Math.abs(b2) > 1e-12,
    }
  }
  return { order: 1, A: [[0]], B: [1], C: [0], D: 0, improper: true }
}

function rk4Step(
  A: number[][],
  B: number[],
  n: number,
  x: number[],
  t: number,
  h: number,
  input: (t: number) => number,
): number[] {
  const f = (xx: number[], tt: number): number[] => {
    const u1 = input(tt)
    const out = new Array<number>(n)
    for (let i = 0; i < n; i++) {
      out[i] = A[i][0] * xx[0] + (n > 1 ? A[i][1] * xx[1] : 0) + B[i] * u1
    }
    return out
  }
  const k1 = f(x, t)
  const x2 = x.map((v, i) => v + (h / 2) * k1[i])
  const k2 = f(x2, t + h / 2)
  const x3 = x.map((v, i) => v + (h / 2) * k2[i])
  const k3 = f(x3, t + h / 2)
  const x4 = x.map((v, i) => v + h * k3[i])
  const k4 = f(x4, t + h)
  return x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]))
}

function observe(ss: SS, x: number[], u: number): number {
  return ss.C[0] * x[0] + (ss.order > 1 ? ss.C[1] * x[1] : 0) + ss.D * u
}

/** 强迫输入仿真（RK4）：input(t) 任意 */
export function simulateCTForced(
  ss: SS,
  input: (t: number) => number,
  T: number,
  M: number,
): { t: number[]; u: number[]; y: number[] } {
  const h = T / M
  let x = new Array<number>(ss.order).fill(0)
  const ts: number[] = []
  const us: number[] = []
  const ys: number[] = []
  for (let i = 0; i <= M; i++) {
    const t = i * h
    const u = input(t)
    ts.push(t)
    us.push(u)
    ys.push(observe(ss, x, u))
    if (i < M) x = rk4Step(ss.A, ss.B, ss.order, x, t, h, input)
  }
  return { t: ts, u: us, y: ys }
}

/**
 * 冲激响应 h(t) = C e^{At} B（+ D·δ(t) 直通项）。
 * 用"零输入、初始状态 x(0)=B"精确仿真 e^{At}B，避免对 δ 数值近似。
 */
export function simulateCTImpulse(ss: SS, T: number, M: number): { t: number[]; y: number[] } {
  const h = T / M
  let x = ss.B.slice()
  const ts: number[] = []
  const ys: number[] = []
  const zero = () => 0
  for (let i = 0; i <= M; i++) {
    const t = i * h
    ts.push(t)
    ys.push(ss.C[0] * x[0] + (ss.order > 1 ? ss.C[1] * x[1] : 0))
    if (i < M) x = rk4Step(ss.A, ss.B, ss.order, x, t, h, zero)
  }
  return { t: ts, y: ys }
}

/* ---------------- 离散时间仿真（差分方程精确递推） ---------------- */

export function simulateDT(s: DTSystem, xIn: ArrayLike<number>): { n: number[]; y: number[] } {
  const [b0, b1, b2] = s.b
  const [a1, a2] = s.a
  const N = xIn.length
  const y = new Array<number>(N).fill(0)
  for (let i = 0; i < N; i++) {
    const x0 = xIn[i]
    const x1 = i >= 1 ? xIn[i - 1] : 0
    const x2 = i >= 2 ? xIn[i - 2] : 0
    const y1 = i >= 1 ? y[i - 1] : 0
    const y2 = i >= 2 ? y[i - 2] : 0
    let v = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    if (!isFinite(v) || Math.abs(v) > 1e8) v = Math.sign(v) * 1e8 // 不稳定系统限幅
    y[i] = v
  }
  return { n: Array.from({ length: N }, (_, i) => i), y }
}

/* ---------------- ROC 与稳定性 ---------------- */

export type RocBand = { lo: number | null; hi: number | null } // CT: σ 区间；DT: |z| 区间

/** 连续系统候选 ROC（按极点实部切分）；默认返回因果 ROC（最右极点右侧） */
export function rocCT(poles: Cx[], which: 'causal' | 'anti' | number): RocBand {
  const sigmas = [...new Set(poles.map((p) => p.re))].sort((x, y) => x - y)
  if (which === 'causal') return { lo: sigmas[sigmas.length - 1] ?? -Infinity, hi: null }
  if (which === 'anti') return { lo: null, hi: sigmas[0] ?? Infinity }
  // 双边：选第 which 条带
  const bounds = [-Infinity, ...sigmas, Infinity]
  const i = Math.max(0, Math.min(which, bounds.length - 2))
  return { lo: bounds[i], hi: bounds[i + 1] }
}

export function rocCTStable(band: RocBand): boolean {
  return (band.lo === null || band.lo < 0) && (band.hi === null || band.hi > 0)
}

export function rocDT(poles: Cx[], which: 'causal' | 'anti' | number): RocBand {
  const radii = [...new Set(poles.map((p) => Math.hypot(p.re, p.im)))].sort((x, y) => x - y)
  if (which === 'causal') return { lo: radii[radii.length - 1] ?? 0, hi: null }
  if (which === 'anti') return { lo: null, hi: radii[0] ?? Infinity }
  const bounds = [0, ...radii, Infinity]
  const i = Math.max(0, Math.min(which, bounds.length - 2))
  return { lo: bounds[i], hi: bounds[i + 1] }
}

export function rocDTStable(band: RocBand): boolean {
  return (band.lo === null || band.lo < 1) && (band.hi === null || band.hi > 1)
}

/** 连续二阶对 → (ζ, ωn) */
export function ctPairParams(p: Cx): { zeta: number; wn: number } {
  const wn = Math.hypot(p.re, p.im)
  const zeta = wn > 0 ? -p.re / wn : 0
  return { zeta, wn }
}

/** 离散极点模长与角度 */
export function dtPairParams(p: Cx): { r: number; theta: number } {
  return { r: Math.hypot(p.re, p.im), theta: Math.atan2(p.im, p.re) }
}

export function fmtCx(p: Cx, digits = 2): string {
  const r = p.re.toFixed(digits)
  if (Math.abs(p.im) < 5e-3 * Math.max(1, Math.abs(p.re))) return r
  const im = Math.abs(p.im).toFixed(digits)
  return `${r} ${p.im >= 0 ? '+' : '−'} j${im}`
}
