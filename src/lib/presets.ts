// 演示案例库：信号、系统、卷积对、性质演示基信号、拉普拉斯解析变换对
// label/note 为中文，labelEn/noteEn 为英文（i18n 按 lang 取用）
import type { Params } from './parser'
import { cx, cAdd, cDiv, cMul, cSub, cExp, cAbs, type Cx } from './numeric'

export type SignalPreset = {
  id: string
  label: string
  labelEn: string
  expr: string
  params?: Partial<Params>
  win?: [number, number] // CT 时间窗
  nwin?: [number, number] // DT 序号窗
  wmax?: number // 频谱观察范围 rad/s（或 DT 用不到）
  note: string
  noteEn: string
}

export const CT_SIGNALS: SignalPreset[] = [
  {
    id: 'damped-sin',
    label: '阻尼振荡 e^{-at}·sin(2πf₀t)·u(t)',
    labelEn: 'Damped sinusoid e^{−at}·sin(2πf₀t)·u(t)',
    expr: 'exp(-a*t)*sin(2*pi*f0*t)*u(t)',
    params: { a: 0.8, f0: 2 },
    win: [-1, 6],
    wmax: 25,
    note: '单边衰减振荡 → 频谱在 ±2πf₀ 附近呈洛伦兹形峰；a 越小（衰减越慢）峰越尖锐。',
    noteEn: 'One-sided decaying oscillation → Lorentzian peaks near ±2πf₀; the smaller a (slower decay), the sharper the peaks.',
  },
  {
    id: 'exp-decay',
    label: '单边指数 e^{-at}·u(t)',
    labelEn: 'One-sided exponential e^{−at}·u(t)',
    expr: 'exp(-a*t)*u(t)',
    params: { a: 1.2 },
    win: [-1, 6],
    wmax: 25,
    note: '经典结果 X(ω) = 1/(a+jω)：幅度谱 1/√(a²+ω²)，相位 −arctan(ω/a)。',
    noteEn: 'Classic result X(ω) = 1/(a+jω): magnitude 1/√(a²+ω²), phase −arctan(ω/a).',
  },
  {
    id: 'rect',
    label: '矩形脉冲 rect(t/τ)',
    labelEn: 'Rectangular pulse rect(t/τ)',
    expr: 'rect(t/tau)',
    params: { tau: 1.6 },
    win: [-3, 3],
    wmax: 30,
    note: 'X(ω) = τ·sinc(ωτ/2π)：矩形 ↔ sinc。零点间隔 2π/τ；τ 越宽频谱越窄（反比关系）。',
    noteEn: 'X(ω) = τ·sinc(ωτ/2π): rectangle ↔ sinc. Zeros spaced 2π/τ apart; a wider τ means a narrower spectrum (inverse relation).',
  },
  {
    id: 'two-tone',
    label: '双音叠加 sin(2πf₀t) + 0.6·sin(2πbt)',
    labelEn: 'Two tones sin(2πf₀t) + 0.6·sin(2πbt)',
    expr: 'sin(2*pi*f0*t) + 0.6*sin(2*pi*b*t)',
    params: { f0: 1.5, b: 4 },
    win: [-6, 6],
    wmax: 40,
    note: '两个频率成分 → 频谱两对峰。观察窗有限时谱峰呈 sinc 形泄漏（加长窗口可收敛到冲激线谱）。',
    noteEn: 'Two frequency components → two pairs of peaks. With a finite window the peaks leak in a sinc shape (lengthen the window to approach impulse line spectra).',
  },
  {
    id: 'gauss',
    label: '高斯脉冲 e^{-t²/2τ²}',
    labelEn: 'Gaussian pulse e^{−t²/2τ²}',
    expr: 'exp(-(t*t)/(2*tau*tau))',
    params: { tau: 0.8 },
    win: [-4, 4],
    wmax: 12,
    note: '高斯的傅里叶变换仍是高斯：X(ω) = τ√(2π)·e^{-τ²ω²/2}。时宽×带宽为常数。',
    noteEn: 'The Fourier transform of a Gaussian is again a Gaussian: X(ω) = τ√(2π)·e^{−τ²ω²/2}. Time width × bandwidth is constant.',
  },
  {
    id: 'tri',
    label: '三角脉冲 tri(t/τ)',
    labelEn: 'Triangular pulse tri(t/τ)',
    expr: 'tri(t/tau)',
    params: { tau: 2 },
    win: [-3, 3],
    wmax: 25,
    note: 'X(ω) = (τ/2)·sinc²(ωτ/4π)：自卷积三角的谱是 sinc²，主瓣更窄、旁瓣更快衰减。',
    noteEn: 'X(ω) = (τ/2)·sinc²(ωτ/4π): the self-convolved triangle has a sinc² spectrum with a narrower main lobe and faster side-lobe decay.',
  },
  {
    id: 'sinc-pulse',
    label: '抽样函数 sinc(f₀t)',
    labelEn: 'Sampling function sinc(f₀t)',
    expr: 'sinc(f0*t)',
    params: { f0: 1.5 },
    win: [-5, 5],
    wmax: 14,
    note: '时域 sinc ↔ 频域近似矩形（带宽 f₀ 的双脉冲对）；窗长加大趋近理想矩形谱。',
    noteEn: 'Time-domain sinc ↔ approximately rectangular spectrum (a pair of pulses of bandwidth f₀); a longer window approaches the ideal rectangular spectrum.',
  },
  {
    id: 'square',
    label: '周期方波 sgn(sin(2πf₀t))',
    labelEn: 'Periodic square wave sgn(sin(2πf₀t))',
    expr: 'sgn(sin(2*pi*f0*t))',
    params: { f0: 1 },
    win: [-4, 4],
    wmax: 30,
    note: '奇谐波线谱（1, 3, 5…倍频），幅度按 1/n 衰减；观察窗截断后线谱呈 sinc 形包络。',
    noteEn: 'Odd-harmonic line spectrum (1st, 3rd, 5th… harmonics) with amplitudes decaying as 1/n; window truncation gives the lines a sinc-shaped envelope.',
  },
  {
    id: 'exp-diff',
    label: '双指数差 e^{-at}u(t) − e^{-bt}u(t)',
    labelEn: 'Difference of two exponentials e^{−at}u(t) − e^{−bt}u(t)',
    expr: 'exp(-a*t)*u(t) - exp(-b*t)*u(t)',
    params: { a: 2, b: 0.7 },
    win: [-1, 8],
    wmax: 15,
    note: '两个单边指数相减 → 频谱在 ω=0 处幅度凹陷，呈带通形。',
    noteEn: 'Two one-sided exponentials subtracted → a dip in the spectrum at ω=0, band-pass shaped.',
  },
  {
    id: 'custom',
    label: '自定义信号…',
    labelEn: 'Custom signal…',
    expr: 'sin(2*pi*f0*t)*u(t)',
    params: { f0: 2 },
    win: [-1, 6],
    wmax: 20,
    note: '在左侧输入任意受支持的表达式开始实验。',
    noteEn: 'Type any supported expression on the left to start experimenting.',
  },
]

export const DT_SIGNALS: SignalPreset[] = [
  {
    id: 'decay',
    label: '指数序列 aⁿ·u[n]',
    labelEn: 'Exponential sequence aⁿ·u[n]',
    expr: 'pow(a, n)*u(n)',
    params: { a: 0.9 },
    nwin: [0, 80],
    note: 'DTFT: X(e^{jω}) = 1/(1 − a·e^{-jω})，|X| 在 ω=0 呈洛伦兹峰；a→1 时峰更尖（序列更长）。',
    noteEn: 'DTFT: X(e^{jω}) = 1/(1 − a·e^{−jω}); |X| has a Lorentzian peak at ω=0. As a→1 the peak sharpens (longer sequence).',
  },
  {
    id: 'delta',
    label: '单位冲激 δ[n]',
    labelEn: 'Unit impulse δ[n]',
    expr: 'delta(n)',
    nwin: [-8, 16],
    note: 'δ[n] 的 DTFT 恒为 1：所有频率成分均匀存在。冲激是 LTI 系统的特征探测信号。',
    noteEn: 'The DTFT of δ[n] is identically 1: every frequency is present equally. The impulse is the probing signal that characterizes LTI systems.',
  },
  {
    id: 'unit-step',
    label: '单位阶跃 u[n]',
    labelEn: 'Unit step u[n]',
    expr: 'u(n)',
    nwin: [-8, 64],
    note: '截断后的 u[n] 频谱在 ω=0 出现 Dirichlet 核形主峰（真实 u[n] 在 ω=0 有冲激，需无限长）。',
    noteEn: 'The truncated u[n] spectrum shows a Dirichlet-kernel main peak at ω=0 (the true u[n] has an impulse at ω=0 and must be infinitely long).',
  },
  {
    id: 'dt-sin',
    label: '正弦序列 sin(ω₀n)',
    labelEn: 'Sinusoidal sequence sin(ω₀n)',
    expr: 'sin(w0*n)',
    params: { w0: 0.7 },
    nwin: [-48, 48],
    note: '频谱在 ±ω₀ 处成对出现峰；DTFT 以 2π 为周期，故只在 (−π, π] 内观察。',
    noteEn: 'Paired spectral peaks at ±ω₀; the DTFT is periodic with period 2π, so we only view (−π, π].',
  },
  {
    id: 'pulse',
    label: '长度 L 矩形脉冲序列 u[n]−u[n−L]',
    labelEn: 'Rectangular pulse sequence of length L, u[n]−u[n−L]',
    expr: 'u(n) - u(n - L)',
    params: { L: 10 },
    nwin: [-6, 24],
    note: 'DTFT 为 Dirichlet 核：L·|sin(ωL/2)/sin(ω/2)|；主瓣宽度 ∝ 2π/L，L 越长主瓣越窄。',
    noteEn: 'The DTFT is the Dirichlet kernel: L·|sin(ωL/2)/sin(ω/2)|; main-lobe width ∝ 2π/L — longer L, narrower lobe.',
  },
  {
    id: 'damped-osc',
    label: '衰减振荡 aⁿ·sin(ω₀n)·u[n]',
    labelEn: 'Decaying oscillation aⁿ·sin(ω₀n)·u[n]',
    expr: 'pow(a, n)*sin(w0*n)*u(n)',
    params: { a: 0.94, w0: 0.3 },
    nwin: [0, 120],
    note: '离散阻尼振荡：谱峰位于 ±ω₀，峰宽由衰减速率 a 决定。',
    noteEn: 'Discrete damped oscillation: spectral peaks at ±ω₀ whose width is set by the decay rate a.',
  },
  {
    id: 'custom',
    label: '自定义序列…',
    labelEn: 'Custom sequence…',
    expr: 'sin(w0*n) + 0.5*sin(2*w0*n)',
    params: { w0: 0.4 },
    nwin: [-48, 48],
    note: '在左侧输入以 n 为自变量的表达式（可用 u(n)、delta(n)、pow 等）。',
    noteEn: 'Type an expression in n on the left (u(n), delta(n), pow, etc. are available).',
  },
]

/* ---------------- 系统预设 ---------------- */

export type SystemPresetCT = {
  id: string
  label: string
  labelEn: string
  b: [number, number, number] // b2 s² + b1 s + b0
  a: [number, number, number] // a2 s² + a1 s + a0
  wmax: number
  input: 'impulse' | 'step' | 'sin'
  f?: number
  note: string
  noteEn: string
}

export const CT_SYSTEMS: SystemPresetCT[] = [
  {
    id: 'lowpass',
    label: '二阶低通 K·ωn²/(s²+2ζωn·s+ωn²)',
    labelEn: 'Second-order low-pass K·ωn²/(s²+2ζωn·s+ωn²)',
    b: [0, 0, 4],
    a: [1, 0.6, 4],
    wmax: 12,
    input: 'step',
    note: 'ζ=0.15 的弱阻尼低通：阶跃响应有超调振荡；极点靠近虚轴 → 幅频出现谐振峰。',
    noteEn: 'Weakly damped low-pass with ζ=0.15: overshooting, ringing step response; poles near the jω axis → a resonance peak in the magnitude response.',
  },
  {
    id: 'lowpass-crit',
    label: '二阶低通（临界阻尼 ζ=1）',
    labelEn: 'Second-order low-pass (critically damped, ζ=1)',
    b: [0, 0, 4],
    a: [1, 4, 4],
    wmax: 12,
    input: 'step',
    note: '双重实极点 s=−2：阶跃响应无超调，恰以最快速度趋近稳态。',
    noteEn: 'Double real pole at s=−2: no overshoot, approaching steady state as fast as possible.',
  },
  {
    id: 'highpass',
    label: '二阶高通 s²/(s²+2ζωn·s+ωn²)',
    labelEn: 'Second-order high-pass s²/(s²+2ζωn·s+ωn²)',
    b: [1, 0, 0],
    a: [1, 0.6, 4],
    wmax: 12,
    input: 'sin',
    f: 0.3,
    note: '原点处双零点：直流增益为 0，高频增益 1；低频正弦被大幅衰减并相移。',
    noteEn: 'Double zero at the origin: DC gain 0, high-frequency gain 1; low-frequency sines are heavily attenuated and phase-shifted.',
  },
  {
    id: 'bandpass',
    label: '二阶带通 2ζωn·s/(s²+2ζωn·s+ωn²)',
    labelEn: 'Second-order band-pass 2ζωn·s/(s²+2ζωn·s+ωn²)',
    b: [0, 0.6, 0],
    a: [1, 0.6, 4],
    wmax: 12,
    input: 'sin',
    f: 0.32,
    note: '零点在原点、极点对称分布：只在 ωn≈2 rad/s 附近通过，带宽由 ζ 决定。',
    noteEn: 'Zero at the origin, symmetric poles: passes only around ωn≈2 rad/s, with bandwidth set by ζ.',
  },
  {
    id: 'notch',
    label: '带阻（陷波）(s²+ωn²)/(s²+2ζωn·s+ωn²)',
    labelEn: 'Band-stop (notch) (s²+ωn²)/(s²+2ζωn·s+ωn²)',
    b: [1, 0, 4],
    a: [1, 0.6, 4],
    wmax: 14,
    input: 'sin',
    f: 0.32,
    note: '零点在 ±jωn：在 ω=ωn 处响应被精确抵消（陷波），对其它频率透明。',
    noteEn: 'Zeros at ±jωn: the response at ω=ωn is exactly cancelled (notch), transparent to all other frequencies.',
  },
  {
    id: 'resonator',
    label: '谐振器（高 Q 低通 ζ=0.03）',
    labelEn: 'Resonator (high-Q low-pass, ζ=0.03)',
    b: [0, 0, 4],
    a: [1, 0.12, 4],
    wmax: 12,
    input: 'sin',
    f: 0.318,
    note: '极点极靠近虚轴：ω=2 附近谐振放大，冲激响应长时间等幅振荡——钟被敲响的模型。',
    noteEn: 'Poles extremely close to the jω axis: resonant amplification near ω=2 and a long, nearly constant-amplitude impulse response — the model of a struck bell.',
  },
  {
    id: 'allpass',
    label: '全通 (s²−2ζωn·s+ωn²)/(s²+2ζωn·s+ωn²)',
    labelEn: 'All-pass (s²−2ζωn·s+ωn²)/(s²+2ζωn·s+ωn²)',
    b: [1, -0.6, 4],
    a: [1, 0.6, 4],
    wmax: 12,
    input: 'sin',
    f: 0.5,
    note: '零极点关于虚轴镜像：幅度谱恒为 1，只有相位随频率变化（纯相位均衡器）。',
    noteEn: 'Zeros mirror-imaged across the jω axis: magnitude identically 1, only phase varies with frequency (a pure phase equalizer).',
  },
  {
    id: 'integrator',
    label: '积分器 1/s',
    labelEn: 'Integrator 1/s',
    b: [0, 0, 1],
    a: [1, 0, 0],
    wmax: 10,
    input: 'step',
    note: '极点在原点：阶跃→斜坡，幅度谱 ∝1/ω。ROC 不含 jω 轴 → 边界稳定。',
    noteEn: 'Pole at the origin: step → ramp, magnitude ∝ 1/ω. The ROC excludes the jω axis → marginally stable.',
  },
  {
    id: 'rc-lp',
    label: '一阶 RC 低通 ωc/(s+ωc)',
    labelEn: 'First-order RC low-pass ωc/(s+ωc)',
    b: [0, 0, 2],
    a: [0, 1, 2],
    wmax: 12,
    input: 'step',
    note: '单极点 s=−2：转折频率 ωc=2 rad/s，相位最大滞后 90°。时间常数 τ=0.5s。',
    noteEn: 'Single pole at s=−2: corner frequency ωc=2 rad/s, phase lag up to 90°. Time constant τ=0.5 s.',
  },
  {
    id: 'custom',
    label: '自定义系统…',
    labelEn: 'Custom system…',
    b: [0, 0, 1],
    a: [1, 1, 1],
    wmax: 12,
    input: 'step',
    note: '用左侧系数滑杆构造 H(s)，或点击零极点图放置共轭极点对。',
    noteEn: 'Build H(s) with the coefficient sliders on the left, or click the pole-zero plot to place a conjugate pole pair.',
  },
]

export type SystemPresetDT = {
  id: string
  label: string
  labelEn: string
  b: [number, number, number] // b0 + b1 z⁻¹ + b2 z⁻²
  a: [number, number] // 1 + a1 z⁻¹ + a2 z⁻²
  note: string
  noteEn: string
}

export const DT_SYSTEMS: SystemPresetDT[] = [
  {
    id: 'ema',
    label: '指数平滑 (1−α)/(1−α·z⁻¹)',
    labelEn: 'Exponential smoothing (1−α)/(1−α·z⁻¹)',
    b: [0.2, 0, 0],
    a: [-0.8, 0],
    note: '一阶 IIR 低通：极点 z=0.8，截止约 0.21·fs。冲激响应为指数衰减序列。',
    noteEn: 'First-order IIR low-pass: pole at z=0.8, cutoff around 0.21·fs. Exponentially decaying impulse response.',
  },
  {
    id: 'resonator',
    label: '数字谐振器 (1−r)/(1−2r·cosθ·z⁻¹+r²·z⁻²)',
    labelEn: 'Digital resonator (1−r)/(1−2r·cosθ·z⁻¹+r²·z⁻²)',
    b: [0.05, 0, 0],
    a: [-1.8153, 0.9025],
    note: '极点对 r·e^{±jθ}（r=0.95, θ=0.3rad）：冲激响应按 aⁿ 慢衰减振荡，ω=θ 处强峰。',
    noteEn: 'Pole pair r·e^{±jθ} (r=0.95, θ=0.3 rad): slowly decaying oscillatory impulse response with a strong peak at ω=θ.',
  },
  {
    id: 'notch',
    label: '数字陷波 (1−2cosθ·z⁻¹+z⁻²)/(1−2r·cosθ·z⁻¹+r²·z⁻²)',
    labelEn: 'Digital notch (1−2cosθ·z⁻¹+z⁻²)/(1−2r·cosθ·z⁻¹+r²·z⁻²)',
    b: [1, -1.9107, 1],
    a: [-1.8153, 0.9025],
    note: '单位圆上的零点对在 ω=±0.3 处完全抑制；极点稍内侧控制陷波宽度。',
    noteEn: 'Zeros on the unit circle fully suppress ω=±0.3; poles slightly inside control the notch width.',
  },
  {
    id: 'ma',
    label: '滑动平均 (1+z⁻¹+z⁻²)/3',
    labelEn: 'Moving average (1+z⁻¹+z⁻²)/3',
    b: [0.3333, 0.3333, 0.3333],
    a: [0, 0],
    note: 'FIR：零点在单位圆 ω=±2π/3（不取 0）。平滑噪声，但会钝化边缘。',
    noteEn: 'FIR: zeros on the unit circle at ω=±2π/3 (not at 0). Smooths noise but blurs edges.',
  },
  {
    id: 'hp1',
    label: '一阶高通 (1−z⁻¹)/2',
    labelEn: 'First-order high-pass (1−z⁻¹)/2',
    b: [0.5, -0.5, 0],
    a: [0, 0],
    note: '零点在 z=1：直流完全抑制；|H| 从 0 升到 1（奈奎斯特处）。',
    noteEn: 'Zero at z=1: DC fully suppressed; |H| rises from 0 to 1 at Nyquist.',
  },
  {
    id: 'custom',
    label: '自定义系统…',
    labelEn: 'Custom system…',
    b: [0.5, 0.5, 0],
    a: [-0.6, 0],
    note: '用左侧系数滑杆构造 H(z)，或点击零极点图放置共轭极点对（单位圆内 → 稳定）。',
    noteEn: 'Build H(z) with the coefficient sliders on the left, or click the pole-zero plot to place a conjugate pole pair (inside the unit circle → stable).',
  },
]

/* ---------------- 卷积预设 ---------------- */

export type ConvPreset = {
  id: string
  label: string
  labelEn: string
  xExpr: string
  hExpr: string
  params?: Partial<Params>
  win?: [number, number]
  nwin?: [number, number]
  note: string
  noteEn: string
}

export const CT_CONV: ConvPreset[] = [
  {
    id: 'rect-rect',
    label: '矩形 ∗ 矩形 → 三角形',
    labelEn: 'Rectangle ∗ rectangle → triangle',
    xExpr: 'rect(t/tau)',
    hExpr: 'rect(t/tau)',
    params: { tau: 1 },
    win: [-3, 3],
    note: '经典结果：等宽矩形卷积得三角形，峰值 = ∫rect² = τ。',
    noteEn: 'Classic result: convolving two equal-width rectangles gives a triangle with peak = ∫rect² = τ.',
  },
  {
    id: 'rect-exp',
    label: '矩形 ∗ 指数衰减',
    labelEn: 'Rectangle ∗ decaying exponential',
    xExpr: 'rect(t/tau)',
    hExpr: 'exp(-a*t)*u(t)',
    params: { tau: 1, a: 1.5 },
    win: [-2, 6],
    note: '先线性上升（滑入矩形），再按指数衰减回零——RC 电路对矩形脉冲的响应。',
    noteEn: 'Rises linearly (as the exponential slides into the rectangle), then decays exponentially back to zero — the RC-circuit response to a rectangular pulse.',
  },
  {
    id: 'exp-exp',
    label: '指数 ∗ 指数',
    labelEn: 'Exponential ∗ exponential',
    xExpr: 'exp(-a*t)*u(t)',
    hExpr: 'exp(-b*t)*u(t)',
    params: { a: 2, b: 0.8 },
    win: [-1, 8],
    note: '(e^{-at} − e^{-bt})/(b−a)：快指数与慢指数之差，峰值出现在 t* = ln(a/b)/(a−b)。',
    noteEn: '(e^{−at} − e^{−bt})/(b−a): the difference between the fast and slow exponentials, peaking at t* = ln(a/b)/(a−b).',
  },
  {
    id: 'gauss-gauss',
    label: '高斯 ∗ 高斯',
    labelEn: 'Gaussian ∗ Gaussian',
    xExpr: 'exp(-(t*t)/(2*tau*tau))',
    hExpr: 'exp(-(t*t)/(2*tau*tau))',
    params: { tau: 0.7 },
    win: [-4, 4],
    note: '高斯卷高斯 = 更宽的高斯（方差相加）：τ√2·√π。随机过程与热扩散的核心模型。',
    noteEn: 'Gaussian convolved with Gaussian = a wider Gaussian (variances add): τ√2·√π. The core model of random processes and heat diffusion.',
  },
  {
    id: 'burst-exp',
    label: '正弦爆发 ∗ 指数',
    labelEn: 'Sine burst ∗ exponential',
    xExpr: 'sin(2*pi*f0*t)*u(t)',
    hExpr: 'exp(-a*t)*u(t)',
    params: { f0: 3, a: 1.2 },
    win: [-1, 8],
    note: '系统对突然加入的正弦：先经历暂态建立过程，再进入稳态（相位滞后）。',
    noteEn: 'The system response to a suddenly applied sine: a transient build-up first, then steady state (with phase lag).',
  },
  {
    id: 'tri-rect',
    label: '三角 ∗ 矩形',
    labelEn: 'Triangle ∗ rectangle',
    xExpr: 'tri(t/tau)',
    hExpr: 'rect(t/tau)',
    params: { tau: 1 },
    win: [-3, 3],
    note: '三角形被矩形“抹平”成圆角梯形：卷积是平滑算子，结果总比两者都宽。',
    noteEn: 'The triangle is “smeared” by the rectangle into a rounded trapezoid: convolution is a smoothing operator and the result is always wider than both.',
  },
]

export const DT_CONV: ConvPreset[] = [
  {
    id: 'delta-h',
    label: 'δ[n] ∗ h[n] → h[n]',
    labelEn: 'δ[n] ∗ h[n] → h[n]',
    xExpr: 'delta(n)',
    hExpr: 'pow(a, n)*u(n)',
    params: { a: 0.85 },
    nwin: [0, 24],
    note: '冲激是卷积的单位元：δ ∗ h = h。这就是冲激响应完全刻画 LTI 系统的原因。',
    noteEn: 'The impulse is the identity of convolution: δ ∗ h = h. This is why the impulse response fully characterizes an LTI system.',
  },
  {
    id: 'u-u',
    label: 'u[n] ∗ u[n] → 斜坡',
    labelEn: 'u[n] ∗ u[n] → ramp',
    xExpr: 'u(n)',
    hExpr: 'u(n)',
    nwin: [0, 20],
    note: '阶跃卷阶跃得斜坡 (n+1)：两次积分。离散矩形面积逐点累积。',
    noteEn: 'Step convolved with step gives the ramp (n+1): integration twice; discrete rectangular areas accumulate point by point.',
  },
  {
    id: 'an-an',
    label: 'aⁿu[n] ∗ aⁿu[n]',
    labelEn: 'aⁿu[n] ∗ aⁿu[n]',
    xExpr: 'pow(a, n)*u(n)',
    hExpr: 'pow(a, n)*u(n)',
    params: { a: 0.8 },
    nwin: [0, 24],
    note: '结果 (n+1)·aⁿ：几何级数部分和。频域验证：X² = (1/(1−ae^{-jω}))²。',
    noteEn: 'Result (n+1)·aⁿ: the partial sum of a geometric series. Frequency-domain check: X² = (1/(1−ae^{−jω}))².',
  },
  {
    id: 'pulses',
    label: '矩形序列 ∗ 矩形序列',
    labelEn: 'Rectangular sequence ∗ rectangular sequence',
    xExpr: 'u(n) - u(n - L)',
    hExpr: 'u(n) - u(n - L)',
    params: { L: 6 },
    nwin: [0, 24],
    note: '离散三角→梯形：卷积结果长度 = Lx + Lh − 1（长度可加性）。',
    noteEn: 'Discrete triangle → trapezoid: the convolution length = Lx + Lh − 1 (length additivity).',
  },
  {
    id: 'an-sin',
    label: 'aⁿu[n] ∗ sin(ω₀n)u[n]',
    labelEn: 'aⁿu[n] ∗ sin(ω₀n)u[n]',
    xExpr: 'pow(a, n)*u(n)',
    hExpr: 'sin(w0*n)*u(n)',
    params: { a: 0.9, w0: 0.4 },
    nwin: [0, 40],
    note: '指数系统对正弦输入：暂态 + 稳态正弦（幅度相位由 H(e^{jω₀}) 决定）。',
    noteEn: 'An exponential system driven by a sine: transient + steady-state sine (amplitude and phase set by H(e^{jω₀})).',
  },
]

/* ---------------- 采样定理·混叠演示 ---------------- */

export const SAMPLING_SIGNALS: SignalPreset[] = [
  {
    id: 'tone',
    label: '纯正弦 sin(2πf₀t)',
    labelEn: 'Pure sine sin(2πf₀t)',
    expr: 'sin(2*pi*f0*t)',
    params: { f0: 3 },
    win: [-0.5, 2.5],
    note: 'fs > 2f₀ 时采样点唯一确定正弦；把 fs 降到 2f₀ 以下，采样点看起来像一条更低的正弦——混叠发生了。',
    noteEn: 'With fs > 2f₀ the samples determine the sine uniquely; drop fs below 2f₀ and the samples look like a lower sine — aliasing has occurred.',
  },
  {
    id: 'two-tone',
    label: '双音 sin(2πf₀t)+0.6sin(2πbt)',
    labelEn: 'Two tones sin(2πf₀t)+0.6sin(2πbt)',
    expr: 'sin(2*pi*f0*t) + 0.6*sin(2*pi*b*t)',
    params: { f0: 3, b: 7 },
    win: [-0.5, 2],
    note: '两个谱峰各自按 Nyquist 折叠：先混叠的是高频 b——带宽由最高频率决定。',
    noteEn: 'Each spectral peak folds about Nyquist independently: the higher frequency b aliases first — bandwidth is set by the highest frequency.',
  },
  {
    id: 'gauss',
    label: '高斯脉冲 e^{-t²/2τ²}',
    labelEn: 'Gaussian pulse e^{−t²/2τ²}',
    expr: 'exp(-(t*t)/(2*tau*tau))',
    params: { tau: 0.35 },
    win: [-2, 2],
    note: '高斯频谱无限宽，任何 fs 都有轻微混叠；τ 越窄频谱越宽，需要越高的采样率。',
    noteEn: 'The Gaussian spectrum has infinite width, so slight aliasing exists at any fs; the narrower τ, the wider the spectrum and the higher the required sampling rate.',
  },
  {
    id: 'rect',
    label: '矩形脉冲 rect(t/τ)',
    labelEn: 'Rectangular pulse rect(t/τ)',
    expr: 'rect(t/tau)',
    params: { tau: 0.6 },
    win: [-1.5, 1.5],
    note: '矩形 = sinc 谱，旁瓣无限延伸——陡峭边沿永远无法完美重建，这是采样定理的工程含义。',
    noteEn: 'A rectangle has a sinc spectrum with infinitely extending side lobes — sharp edges can never be perfectly reconstructed. That is the engineering meaning of the sampling theorem.',
  },
  {
    id: 'expdecay',
    label: '单边指数 e^{-at}u(t)',
    labelEn: 'One-sided exponential e^{−at}u(t)',
    expr: 'exp(-a*t)*u(t)',
    params: { a: 3 },
    win: [-0.5, 2.5],
    note: '频谱 1/(a+jω) 衰减缓慢：欠采样时频谱拖尾折叠，重建在 t=0 跳变附近失真最明显。',
    noteEn: 'The spectrum 1/(a+jω) decays slowly: with undersampling the spectral tail folds back, and reconstruction is most distorted near the t=0 jump.',
  },
  {
    id: 'chirpish',
    label: '扫频感 sin(2πf₀t²/2)',
    labelEn: 'Chirp-like sin(2πf₀t²/2)',
    expr: 'sin(pi*f0*t*t)',
    params: { f0: 6 },
    win: [0, 1.6],
    note: '瞬时频率 f₀t 随时间升高：同一条 fs 下，前段采样充分、后段开始混叠——“局部 Nyquist”直观演示。',
    noteEn: 'The instantaneous frequency f₀t rises with time: at the same fs, the early part is well sampled while the later part starts to alias — an intuitive demo of “local Nyquist”.',
  },
]

/* ---------------- 性质演示基信号 ---------------- */

export const PROP_BASE: SignalPreset[] = [
  {
    id: 'gauss',
    label: '高斯脉冲',
    labelEn: 'Gaussian pulse',
    expr: 'exp(-(t*t)/(2*tau*tau))',
    params: { tau: 0.8 },
    win: [-4, 4],
    note: '高斯：所有性质下都保持光滑，观察尺度变换最直观。',
    noteEn: 'Gaussian: stays smooth under every property; most intuitive for scaling.',
  },
  {
    id: 'rect',
    label: '矩形脉冲',
    labelEn: 'Rectangular pulse',
    expr: 'rect(t/tau)',
    params: { tau: 1.4 },
    win: [-3, 3],
    note: '矩形：边缘锐利 → 频谱宽；时移后只有相位变化。',
    noteEn: 'Rectangle: sharp edges → wide spectrum; a time shift changes only the phase.',
  },
  {
    id: 'damped',
    label: '阻尼振荡',
    labelEn: 'Damped oscillation',
    expr: 'exp(-a*t)*sin(2*pi*f0*t)*u(t)',
    params: { a: 0.6, f0: 2 },
    win: [-1, 6],
    note: '阻尼振荡：频移实验中观察谱峰搬移最清晰。',
    noteEn: 'Damped oscillation: the clearest view of peak shifting in the frequency-shift experiment.',
  },
  {
    id: 'exp',
    label: '单边指数',
    labelEn: 'One-sided exponential',
    expr: 'exp(-a*t)*u(t)',
    params: { a: 1.2 },
    win: [-1, 6],
    note: '单边指数：微分性质下观察 u(t) 边界冲激项的体现。',
    noteEn: 'One-sided exponential: shows the boundary impulse term from u(t) under the differentiation property.',
  },
]

export const PROP_H: SignalPreset[] = [
  {
    id: 'h-rect',
    label: 'h = 矩形',
    labelEn: 'h = rectangle',
    expr: 'rect(t/tau)',
    params: { tau: 1 },
    win: [-3, 3],
    note: '',
    noteEn: '',
  },
  {
    id: 'h-exp',
    label: 'h = 指数衰减',
    labelEn: 'h = decaying exponential',
    expr: 'exp(-a*t)*u(t)',
    params: { a: 1.5 },
    win: [-1, 6],
    note: '',
    noteEn: '',
  },
  {
    id: 'h-gauss',
    label: 'h = 高斯',
    labelEn: 'h = Gaussian',
    expr: 'exp(-(t*t)/(2*tau*tau))',
    params: { tau: 0.6 },
    win: [-4, 4],
    note: '',
    noteEn: '',
  },
  {
    id: 'h-tri',
    label: 'h = 三角',
    labelEn: 'h = triangle',
    expr: 'tri(t/tau)',
    params: { tau: 1 },
    win: [-3, 3],
    note: '',
    noteEn: '',
  },
]

/* ---------------- 拉普拉斯变换 3D 预设 ----------------
   每条预设给出：时域信号 expr、解析 X(s)（无解析式时 xs 省略 → 数值计算）、极点/零点 */

export type LaplacePreset = {
  id: string
  label: string
  labelEn: string
  expr: string
  params?: Partial<Params>
  win: [number, number]
  /** 解析 X(s)；缺省时用数值积分 ∫x(t)e^{-st}dt */
  xs?: (p: Params) => (s: Cx) => Cx
  poles?: (p: Params) => Cx[]
  zeros?: (p: Params) => Cx[]
  note: string
  noteEn: string
}

/** 安全除法：靠近极点时限幅 |X|≤1e4，避免曲面出现 Inf */
function safeDiv(n: Cx, d: Cx): Cx {
  const d2 = d.re * d.re + d.im * d.im
  if (d2 < 1e-12) {
    const m = Math.hypot(n.re, n.im) || 1
    return cx((n.re / m) * 1e4, (n.im / m) * 1e4)
  }
  return cDiv(n, d)
}

export const LAPLACE_SIGNALS: LaplacePreset[] = [
  {
    id: 'exp-decay',
    label: '单边指数 e^{-at}·u(t)',
    labelEn: 'One-sided exponential e^{−at}·u(t)',
    expr: 'exp(-a*t)*u(t)',
    params: { a: 1.2 },
    win: [-1, 6],
    xs: (p) => (s) => safeDiv(cx(1), cAdd(s, cx(p.a))),
    poles: (p) => [cx(-p.a)],
    note: 'X(s) = 1/(s+a)：曲面在 s=−a 处耸起一座“山峰”（极点）。沿虚轴切一刀得到 1/(a+jω) —— 正是它的傅里叶变换。a 越大山峰离虚轴越近，切面的峰越尖。',
    noteEn: 'X(s) = 1/(s+a): the surface rises into a “mountain” (pole) at s=−a. Slice along the jω axis and you get 1/(a+jω) — exactly its Fourier transform. The larger a, the closer the peak to the axis and the sharper the slice’s peak.',
  },
  {
    id: 'damped-sin',
    label: '阻尼振荡 e^{-at}·sin(ω₀t)·u(t)',
    labelEn: 'Damped sinusoid e^{−at}·sin(ω₀t)·u(t)',
    expr: 'exp(-a*t)*sin(w0*t)*u(t)',
    params: { a: 0.6, w0: 8 },
    win: [-0.5, 6],
    xs: (p) => (s) => safeDiv(cx(p.w0), cAdd(cMul(cAdd(s, cx(p.a)), cAdd(s, cx(p.a))), cx(p.w0 * p.w0))),
    poles: (p) => [cx(-p.a, p.w0), cx(-p.a, -p.w0)],
    note: '一对共轭极点 −a±jω₀：两座对称山峰。峰的高度位置告诉你“衰减多快（σ）+ 振荡多快（ω）”；虚轴切面在 ±ω₀ 附近隆起 —— 就是频谱峰。',
    noteEn: 'A pair of conjugate poles −a±jω₀: two symmetric mountains. Their positions tell you “how fast it decays (σ) + how fast it oscillates (ω)”; the jω section bulges near ±ω₀ — those are the spectral peaks.',
  },
  {
    id: 'sin-causal',
    label: '因果正弦 sin(ω₀t)·u(t)',
    labelEn: 'Causal sine sin(ω₀t)·u(t)',
    expr: 'sin(w0*t)*u(t)',
    params: { w0: 8 },
    win: [-0.5, 8],
    xs: (p) => (s) => safeDiv(cx(p.w0), cAdd(cMul(s, s), cx(p.w0 * p.w0))),
    poles: (p) => [cx(0, p.w0), cx(0, -p.w0)],
    note: '极点恰好在虚轴上（σ=0）！山峰正压着傅里叶切面 —— 所以纯正弦的 FT 是 ±jω₀ 处的冲激（切面撞上山峰，处处有限、唯独峰点发散）。',
    noteEn: 'The poles sit exactly on the jω axis (σ=0)! The peaks press right against the Fourier section — hence the FT of a pure sine is impulses at ±jω₀ (the section runs into the peaks: finite everywhere except at the peak points).',
  },
  {
    id: 'step',
    label: '单位阶跃 u(t)',
    labelEn: 'Unit step u(t)',
    expr: 'u(t)',
    win: [-0.5, 8],
    xs: () => (s) => safeDiv(cx(1), s),
    poles: () => [cx(0)],
    note: 'X(s) = 1/s：极点在原点，正压在虚轴上。这就是 u(t) 的傅里叶变换“不收敛、只能在 ω=0 记一个冲激”的几何解释 —— 想要切面有限，就得把切面移开（σ>0，乘衰减因子 e^{-σt}）。',
    noteEn: 'X(s) = 1/s: the pole sits at the origin, right on the jω axis. This is the geometric explanation of why the FT of u(t) “does not converge and can only be recorded as an impulse at ω=0” — to keep the section finite you must move it away (σ>0, multiplying by a decay factor e^{−σt}).',
  },
  {
    id: 'double-pole',
    label: '斜坡加权 t·e^{-at}·u(t)',
    labelEn: 'Ramp-weighted t·e^{−at}·u(t)',
    expr: 't*exp(-a*t)*u(t)',
    params: { a: 1.2 },
    win: [-0.5, 8],
    xs: (p) => (s) => {
      const d = cAdd(s, cx(p.a))
      return safeDiv(cx(1), cMul(d, d))
    },
    poles: (p) => [cx(-p.a), cx(-p.a)],
    note: '二重极点：山“更高更陡”（二阶峰）。时域乘 t ⇔ s 域求导 ∂X/∂s，同时把极点阶数翻倍。',
    noteEn: 'A double pole: the mountain is “taller and steeper” (a second-order peak). Multiplying by t in time ⇔ differentiating ∂X/∂s in the s-domain, doubling the pole order.',
  },
  {
    id: 'exp-diff',
    label: '双指数差 e^{-at}u(t) − e^{-bt}u(t)',
    labelEn: 'Difference of two exponentials e^{−at}u(t) − e^{−bt}u(t)',
    expr: 'exp(-a*t)*u(t) - exp(-b*t)*u(t)',
    params: { a: 2, b: 0.8 },
    win: [-0.5, 8],
    xs: (p) => (s) =>
      safeDiv(cx(p.b - p.a), cMul(cAdd(s, cx(p.a)), cAdd(s, cx(p.b)))),
    poles: (p) => [cx(-p.a), cx(-p.b)],
    note: '两座山峰（−a 与 −b）。沿虚轴的切面在两峰之间形成带通形凹陷 —— 零点极点布局直接决定频谱形状。',
    noteEn: 'Two mountains (−a and −b). The slice along the jω axis forms a band-pass-shaped dip between them — the pole/zero layout directly shapes the spectrum.',
  },
  {
    id: 'rect',
    label: '矩形脉冲 rect(t/τ)',
    labelEn: 'Rectangular pulse rect(t/τ)',
    expr: 'rect(t/tau)',
    params: { tau: 1.6 },
    win: [-3, 3],
    xs: (p) => (s) => {
      const h = cMul(s, cx(p.tau / 2))
      if (cAbs(h) < 1e-7) return cx(p.tau)
      return safeDiv(cSub(cExp(h), cExp(cMul(cx(-1), h))), s)
    },
    zeros: (p) => {
      const out: Cx[] = []
      for (let k = -3; k <= 3; k++) if (k !== 0) out.push(cx(0, (2 * Math.PI * k) / p.tau))
      return out
    },
    note: '有限时长信号：没有极点，只有一列虚轴上的零点（谷底，间隔 2π/τ）。虚轴切面 = sinc 幅度谱，切面每穿过一个谷底，频谱过一次零。',
    noteEn: 'A finite-duration signal: no poles, only a row of zeros on the jω axis (valleys spaced 2π/τ apart). The jω section is the sinc magnitude spectrum; each valley it crosses is one spectral zero crossing.',
  },
  {
    id: 'custom',
    label: '自定义信号（数值曲面）',
    labelEn: 'Custom signal (numeric surface)',
    expr: 'exp(-a*t)*sin(2*pi*f0*t)*u(t)',
    params: { a: 0.8, f0: 1.5 },
    win: [-0.5, 6],
    note: '任意表达式都可用：对每个 σ 行计算 x(t)·e^{-σt} 的傅里叶积分，逐行“扫描”出整个曲面。没有解析式时极点不标注，但山峰依然可见。',
    noteEn: 'Any expression works: for each σ row the Fourier integral of x(t)·e^{−σt} is computed, “scanning” the surface row by row. Without an analytic form poles are not marked, but the mountains remain visible.',
  },
]
