<div align="center">

[简体中文](README.md) | **English**

[![CI](https://github.com/LINYEANSHU/signals-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/LINYEANSHU/signals-lab/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="./assets/readme/hero.svg" width="100%" alt="Signals &amp; Systems Lab — type an expression and watch its time-domain waveform, spectrum and s-plane behavior come alive in an interactive laboratory" />

</div>

# Signals & Systems Lab

An interactive workbench for the classic **continuous and discrete-time signals and systems** course. Type any supported mathematical expression and watch, in real time, how signals and systems behave across the time domain, the frequency domain, and the complex plane — how convolution flips and slides, why spectra leak, and how a pole becomes a "mountain" on the Laplace surface.

Everything runs locally in the browser. No backend, no sign-up. **User expressions are parsed with mathjs's restricted expression language — arbitrary JavaScript is never executed.**

<div align="center">
<img src="./assets/readme/modules.svg" width="100%" alt="Seven experiment views: Fourier Transform, Laplace 3D, FT Integral Demo, Sampling &amp; Aliasing, Properties, Convolution, Systems &amp; Pole-Zero" />
</div>

## The seven experiments

| # | Experiment | What you can do |
|---|-----------|-----------------|
| 01 | **Fourier Transform** | Switch between CTFT and DTFT; magnitude, phase (with unwrapping), real and imaginary parts; rad/s ↔ Hz units; a **live Parseval energy consistency check**; automatic truncation-leakage warnings |
| 02 | **Laplace 3D** | The \|X(s)\| surface in 3D: poles as peaks, zeros as valleys (analytic X(s) or a row-by-row numeric scan over σ); the **amber jω section is the Fourier transform**; a movable σ₀ section shows what happens when the slice leaves the axis; automatic ROC-vs-axis verdict |
| 03 | **FT Integral Demo** | A point-by-point animation of X(ω₀)=∫x(t)e^{−jω₀t}dt: signal × counter-rotating exponential → real/imaginary products → **a spiral of the accumulated integral in the complex plane** → the moving value on the spectrum; comparison frequency ω₁, jump-to-peak, scrubbable progress |
| 04 | **Sampling & Aliasing** | Sample a continuous signal at fs and watch the spectrum replicate periodically; B₉₉ energy bandwidth is compared against fs/2 to flag undersampling; ideal sinc-interpolation reconstruction with an error readout; **live folding frequencies for every component** |
| 05 | **Properties** | Time shift (magnitude unchanged, phase tilted), frequency shift (AM-style spectral move), scaling (a **numerical verification of the time–bandwidth invariant**), the convolution theorem (\|Y\|=\|X·H\| overlapping point by point), and differentiation (jωX); theory curves drawn directly against numeric results |
| 06 | **Convolution** | The flip–slide–multiply–sum animation for CT and DT, where **the pink overlap area is the current y(t)**; a frequency-domain \|X\|·\|H\|=\|Y\| check; a library of classic convolution pairs |
| 07 | **Systems & Pole-Zero** | Biquad coefficient editing for H(s)/H(z) plus a system library; an s/z-plane pole-zero plot with **ROC shading and a stability verdict**; **click the plot to drop in a conjugate pole pair**; magnitude/phase response (linear/dB); a 3D \|H(s)\| surface; time-domain simulation (state-space RK4 for CT, exact recursion for DT) |

Every experiment ships with **presets** (each with a one-line explanation), **config snapshots** (import/export as JSON — share a starting state with students or assignments), **PNG chart export**, and **keys 1–7 to jump between experiments**.

## Quick start

```bash
git clone https://github.com/LINYEANSHU/signals-lab.git
cd signals-lab
npm install
npm run dev        # dev server → http://localhost:5173
npm run build      # production build → dist/
npm run preview    # preview the production build
```

Requires Node 18+ (CI runs on Node 22). On `npm run dev`, **9 built-in math self-checks** run automatically in the browser console.

The UI follows your browser language by default and can be switched anytime with **🌐 中 / EN** in the top bar (the choice is stored in localStorage).

## Teaching scenarios

- **Lecture demos** — presets follow a teaching arc (damped oscillation → rectangle → Gaussian …), each with a one-line takeaway; keys 1–7 hop between concepts without losing the room.
- **Take-home exploration** — export the current state as a JSON snapshot and hand it to students; they import it and immediately test "what if τ doubles?" from the same starting point.
- **Concept rescue** — the Laplace 3D view turns "why does multiplying by e^{−σt} make it converge?" into a mountain you can orbit; the convolution animation makes flip–slide–sum visible as accumulating area.

## Expression syntax (restricted)

- **Functions**: `u( )` step, `rect( )`, `tri( )`, `sinc( )` (normalized sin πt/πt), `sa( )` (sin t/t), `sgn( )`; the discrete domain adds `delta(n)` = δ[n]
- **Operators**: `exp sin cos tan sqrt abs log pow ^`, implicit multiplication (`2t`, `e^(-2t)`), complex unit `j` or `i`
- **Constants**: `pi`, `e`; **parameters**: `a b f0 w0 tau t0 L` (live sliders on the left; only the ones your expression uses are shown)

## How it's organized

```
src/
├── lib/          Numeric core (UI-free, independently testable)
│   ├── parser.ts     mathjs restricted expression compiler → sampler
│   ├── numeric.ts    NDFT (trapezoidal rule + recurrence), convolution, root finding, cumulative integral
│   ├── systems.ts    Transfer function → poles/zeros / frequency response / state space, RK4 & recursion
│   ├── sampling.ts   Sample grids, sinc interpolation, alias folding, energy bandwidth
│   ├── presets.ts    Bilingual preset library (signals / systems / convolution pairs)
│   ├── devtests.ts   9 math self-checks (rect→sinc zeros, Parseval, convolution peak, flat δ[n] spectrum, …)
│   └── snapshot.ts   Config snapshot validation
├── i18n.tsx      Lightweight bilingual dictionary (Context + localStorage; types guarantee zh/en key parity)
├── components/   LabLayout / Plot (Plotly wrapper) / KaTeX formulas / shared controls
└── views/        The 7 experiment views
```

## Mathematical correctness

- CTFT uses trapezoidal integration over the observation window (NDFT) with a twiddle-factor recurrence in the inner loop — roughly an order of magnitude faster than the naive form
- The Parseval identity ∫|x|²dt = (1/2π)∫|X|²dω is displayed live as a built-in consistency check
- Polynomial roots: closed form up to degree 2, Durand–Kerner iteration beyond; conjugate-pair noise is cleaned for real coefficients
- Continuous simulation: controllable-canonical state space + RK4; the impulse response is computed exactly as h(t)=C·e^{At}B (zero input, initial state B) rather than approximating δ numerically
- Discrete systems: exact difference-equation recursion; the DTFT of a finite sequence is an exact sum
- The 9 math self-checks run automatically on `npm run dev` (results are also written to `window.__devtestResults`)

## Known limits

- The CTFT is a finite-window numerical approximation: if the signal has not decayed inside the window, truncation leakage appears (the UI warns you). This is inherent to numerical Fourier transforms, not a bug
- Continuous systems are limited to proper second-order transfer functions (b₂ must be 0 when a₂=0); unstable discrete simulations are magnitude-clamped

## References & acknowledgements

The course arc follows the classic treatment in *Signals and Systems* (A. V. Oppenheim, A. S. Willsky); the organization across the three domains — time, frequency, and the s/z-plane — draws on the demo experiments commonly used in signals and systems courses.

With thanks to the open-source stack behind it:

- [React](https://react.dev) — component views and concurrent rendering (heavy recomputation degrades gracefully while sliders are dragged)
- [Plotly.js](https://plotly.com/javascript/) — every chart interaction (zoom, drag, hover readouts, 3D surfaces)
- [KaTeX](https://katex.org) — formula typesetting
- [mathjs](https://mathjs.org) — restricted expression parsing (no eval)
- [Vite](https://vite.dev) — dev server and build

## License

[MIT](LICENSE) © 2026 LINYEANSHU
