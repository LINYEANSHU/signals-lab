// Plotly 挂图主题：奶油纸图版上的墨色图表
export const C = {
  signal: '#b45309', // 时域信号（赭石）
  signalFill: 'rgba(180,83,9,0.14)',
  spectrum: '#0e7490', // 频谱（深青）
  spectrumFill: 'rgba(14,116,144,0.12)',
  phase: '#a21caf', // 相位（洋红，数据色）
  real: '#15803d', // 实部（绿）
  imag: '#be185d', // 虚部（玫红）
  output: '#15803d', // 系统输出（绿）
  system: '#1d4ed8', // 系统曲线（蓝）
  pole: '#b91c1c', // 极点（红）
  zero: '#1d4ed8', // 零点（蓝）
  aux: '#6b6250',
  compare: '#be123c', // 对比曲线（玫红）
  grid: '#e0d6bb', // 纸上网格
  zeroline: '#c4b795',
  text: '#3d382a', // 图内文字
  roc: 'rgba(14,116,144,0.10)',
  rocLine: 'rgba(14,116,144,0.55)',
  product: '#be185d',
}

export const FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif'

export function axis(title: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: { text: title, font: { size: 11, color: '#6b6250' }, standoff: 6 },
    gridcolor: C.grid,
    zerolinecolor: C.zeroline,
    linecolor: '#c4b795',
    tickfont: { size: 10, color: '#6b6250' },
    ...extra,
  }
}

export function baseLayout(title: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: C.text, size: 11, family: FONT },
    margin: { l: 52, r: 18, t: 34, b: 40 },
    title: { text: title, font: { size: 13, color: '#1d1a13' }, x: 0.012, xanchor: 'left', y: 0.97 },
    showlegend: true,
    legend: {
      orientation: 'h',
      x: 0.01,
      y: 1.12,
      xanchor: 'left',
      font: { size: 10.5 },
      bgcolor: 'rgba(0,0,0,0)',
    },
    hovermode: 'closest',
    ...extra,
  }
}

export const PLOTLY_CONFIG = {
  displayModeBar: false,
  responsive: true,
  scrollZoom: true,
  doubleClick: 'reset' as const,
}

/** 圆弧采样点（用于 ROC 环带填充） */
export function arcPoints(cx0: number, cy0: number, r: number, a0: number, a1: number, steps = 64): { x: number[]; y: number[] } {
  const x: number[] = []
  const y: number[] = []
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    x.push(cx0 + r * Math.cos(a))
    y.push(cy0 + r * Math.sin(a))
  }
  return { x, y }
}
