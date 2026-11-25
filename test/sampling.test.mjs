import assert from 'node:assert/strict'
import test from 'node:test'
import { sampleGrid, sinc, sincInterp, samplingChallenge } from '../src/lib/sampling.ts'
import { readCheckpoint, writeCheckpoint } from '../src/lib/snapshot.ts'

test('local checkpoints keep each module separate and report damaged or unavailable storage', () => {
  const entries = new Map()
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) }
  assert.equal(readCheckpoint('sampling', storage).status, 'missing')
  assert.equal(writeCheckpoint('sampling', { fs: 15.2, prediction: 3 }, storage), true)
  assert.equal(writeCheckpoint('fourier', { expr: '' }, storage), true)
  assert.equal(readCheckpoint('sampling', storage).data.fs, 15.2)
  assert.equal(readCheckpoint('fourier', storage).data.expr, '')
  const samplingKey = [...entries.keys()][0]
  entries.set(samplingKey, '{"v":1,"view":"fourier"}')
  assert.equal(readCheckpoint('sampling', storage).status, 'invalid')
  const inaccessible = { getItem() { throw new Error('access denied') }, setItem() { throw new Error('quota') } }
  assert.equal(writeCheckpoint('sampling', { fs: 1 }, inaccessible), false)
  assert.equal(readCheckpoint('sampling', inaccessible).status, 'unavailable')
})

test('sampling challenge checks the original alias prediction, strict Nyquist, and sample budget', () => {
  const effectiveRate = (fs) => sampleGrid(-0.5, 2, fs).fsEff
  assert.equal(samplingChallenge(2, effectiveRate(15.2)), 'prediction')
  assert.equal(samplingChallenge(3, effectiveRate(14.1)), 'undersampled')
  assert.equal(samplingChallenge(3, effectiveRate(17)), 'over-budget')
  assert.equal(samplingChallenge(3, effectiveRate(15.2)), 'complete')
})

test('sinc reconstruction matches the direct series and exactly reproduces aligned complex samples', () => {
  const re = Float64Array.of(1, -2, 4, 3)
  const im = Float64Array.of(-1, 0, 2, 5)
  const t0 = -0.5
  const dt = 0.2
  const t = Float64Array.of(-0.6, -0.5, -0.431, -0.3, t0 + 2 * dt, 0.139)
  const y = sincInterp(re, im, t0, dt, t)
  assert.equal(y.re[1], 1)
  assert.equal(y.re[3], -2)
  assert.equal(y.im[3], 0)
  assert.equal(y.im[4], 2)
  for (let j = 0; j < t.length; j++) {
    const expected = (values) => values.reduce((sum, value, i) => sum + value * sinc((t[j] - (t0 + i * dt)) / dt), 0)
    assert.ok(Math.abs(y.re[j] - expected(re)) < 1e-12)
    assert.ok(Math.abs(y.im[j] - expected(im)) < 1e-12)
  }
})
