// 采样定理与混叠的数值核心：折叠频率、采样网格、理想带限（sinc）插值重建。
// 纯函数、无 DOM 依赖，可在 Node 下用 esbuild 打包做随机用例验证。

/** 归一化 sinc：sinc(0)=1，否则 sin(πx)/(πx) */
export function sinc(x: number): number {
  if (x === 0) return 1
  const p = Math.PI * x
  return Math.sin(p) / p
}

/**
 * 折叠（混叠）频率：把频率 f 折叠进 [0, fs/2]。
 * 对纯音 f 采样后，观测到的频率是 |f − round(f/fs)·fs|（≤ fs/2）。
 * fs ≤ 0 时返回 NaN。
 */
export function aliasFreq(f: number, fs: number): number {
  if (!(fs > 0) || !isFinite(f)) return NaN
  const folded = Math.abs(f - Math.round(f / fs) * fs)
  return Math.min(folded, fs / 2)
}

/**
 * 在 [ta, tb] 上按采样率 fs（Hz）生成采样网格。
 * n = round(T·fs) + 1 个点（首尾都在窗上），实际有效采样率 = (n-1)/T。
 */
export function sampleGrid(ta: number, tb: number, fs: number): { t: Float64Array; dt: number; fsEff: number } {
  const T = tb - ta
  const n = Math.max(2, Math.round(Math.max(0, T) * fs) + 1)
  const dt = n > 1 ? T / (n - 1) : T
  const t = new Float64Array(n)
  for (let i = 0; i < n; i++) t[i] = ta + dt * i
  return { t, dt, fsEff: dt > 0 ? 1 / dt : Infinity }
}

/**
 * 理想带限重建（Whittaker–Shannon 插值）：
 *   y(t) = Σ_n x[n]·sinc((t − t_n)/dt)，t_n = t0 + n·dt
 * 对严格带限于 |f| < fs/2 的信号在无限窗下精确；有限窗时窗边截断带来误差。
 * 输出与 tOut 逐点对应的复数值。
 */
export function sincInterp(
  re: Float64Array,
  im: Float64Array,
  t0: number,
  dt: number,
  tOut: Float64Array,
): { re: Float64Array; im: Float64Array } {
  const N = re.length
  const M = tOut.length
  const outRe = new Float64Array(M)
  const outIm = new Float64Array(M)
  for (let j = 0; j < M; j++) {
    const t = tOut[j]
    let sr = 0
    let si = 0
    for (let n = 0; n < N; n++) {
      const s = sinc((t - (t0 + n * dt)) / dt)
      if (s !== 0) {
        sr += re[n] * s
        si += im[n] * s
      }
    }
    outRe[j] = sr
    outIm[j] = si
  }
  return { re: outRe, im: outIm }
}

/**
 * 从宽频扫描求信号的有效带宽：累计能量达到 ratio（如 0.99）对应的 |ω|。
 * omegas 必须从负到正排序且关于 0 对称（由 linspace 生成）。
 */
export function energyBandwidth(
  specRe: Float64Array,
  specIm: Float64Array,
  omegas: Float64Array,
  ratio = 0.99,
): number {
  const M = omegas.length
  let total = 0
  const acc = new Float64Array(M)
  for (let i = 0; i < M; i++) {
    total += specRe[i] * specRe[i] + specIm[i] * specIm[i]
    acc[i] = total
  }
  if (!(total > 0)) return 0
  // 对称谱：从中间向两侧累计，找到累计能量达 ratio·total 的最小 |ω|
  const mid = (M - 1) / 2
  for (let k = 0; k <= mid; k++) {
    const lo = Math.max(0, Math.floor(mid) - k)
    const hi = Math.min(M - 1, Math.ceil(mid) + k)
    const e = acc[hi] - (lo > 0 ? acc[lo - 1] : 0)
    if (e >= ratio * total) return Math.abs(omegas[k])
  }
  return Math.abs(omegas[M - 1])
}
