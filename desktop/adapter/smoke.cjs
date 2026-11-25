const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

module.exports = async ({ evaluate, send, wait, waitUntil, downloadPath }) => {
  const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)}).click()`);
  const slider = label => `document.querySelector(${JSON.stringify(`input[aria-label="${label}"]`)})`;
  const setSlider = (label, value) => evaluate(`(() => {
    const input = ${slider(label)};
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '${value}');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const reload = async expression => {
    await evaluate('window.signalsReloadMarker = true');
    await send('Page.reload');
    await waitUntil(
      () => evaluate(`!window.signalsReloadMarker && Boolean(${expression})`).catch(() => false),
      'the active module reloads',
    );
  };

  await wait("document.querySelectorAll('.js-plotly-plot').length > 0");
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))");
  await wait("location.hash === '#laplace' && document.querySelector('.js-plotly-plot canvas')");
  await evaluate("document.querySelector('.lang-btn[title=English]').click()");
  await setSlider('a', 4);
  await wait(`${slider('σ₀')}.max === '4.9'`);
  await setSlider('σ₀', 4);
  await click('Save locally');
  await reload(`${slider('σ₀')}?.max === '2.5'`);
  await click('Restore save');
  await wait(`${slider('a')}?.value === '4'`);
  assert.equal(await evaluate(`${slider('σ₀')}.value`), '4');
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }))");
  await wait("location.hash === '#sampling' && document.querySelector('input[aria-label=\"Sampling rate fs (Hz)\"]')");
  const challengeStatus = phrase => `document.querySelector('[role=status] .badge')?.textContent.includes(${JSON.stringify(phrase)})`;
  const chooseFrequency = hz => evaluate(`(() => {
    const list = [...document.querySelectorAll('select')].find(select => select.options[0]?.value === '0');
    list.value = '${hz}';
    list.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

  await click('Restore save');
  await wait("document.querySelector('.snapshot-msg')?.textContent.includes('no local save')");
  await click('Load challenge');
  await wait(challengeStatus('Identify the alias'));
  await chooseFrequency(2);
  await wait(challengeStatus('Check the alias'));
  await chooseFrequency(3);
  await wait(challengeStatus('strictly above'));
  await setSlider('Sampling rate fs (Hz)', 17);
  await wait(challengeStatus('exceeds the sampling budget'));
  await setSlider('Sampling rate fs (Hz)', 15.2);
  await wait(challengeStatus('Challenge complete'));
  await click('Save locally');
  await wait("document.querySelector('.snapshot-msg')?.textContent.includes('saved locally')");
  await reload("document.querySelector('.snapshot-io')");
  await click('Restore save');
  await wait(challengeStatus('Challenge complete'));
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Sampling rate fs (Hz)"]').value`), '15.2');

  await wait("document.querySelector('.js-plotly-plot .main-svg')");
  await evaluate(`(async () => {
    const source = [...document.querySelectorAll('link[rel=modulepreload]')].find(link => link.href.includes('/plotly-'));
    const plotly = Object.values(await import(source.href)).find(value => value?.react && value?.purge);
    const target = document.querySelector('.js-plotly-plot');
    const originalReact = plotly.react;
    const originalPurge = plotly.purge;
    const test = window.signalsPlotTeardown = { purged: false, release: null };
    plotly.react = function (gd, ...args) {
      const work = originalReact.call(this, gd, ...args);
      if (gd !== target || test.release) return work;
      const finished = new Promise(resolve => { test.release = resolve; });
      return work.then(value => finished.then(() => value));
    };
    plotly.purge = function (gd, ...args) {
      if (gd === target) test.purged = true;
      return originalPurge.call(this, gd, ...args);
    };
    test.cleanup = () => {
      plotly.react = originalReact;
      plotly.purge = originalPurge;
    };
  })()`);
  await setSlider('Sampling rate fs (Hz)', 14);
  await wait('window.signalsPlotTeardown.release');
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }))");
  await wait("location.hash === '#fourier' && !document.querySelector('input[aria-label=\"Sampling rate fs (Hz)\"]')");
  assert.equal(await evaluate('window.signalsPlotTeardown.purged'), false, 'Teardown waits for an active graph update');
  await evaluate('window.signalsPlotTeardown.release()');
  await wait('window.signalsPlotTeardown.purged');
  await evaluate("window.signalsPlotTeardown.cleanup(); window.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }))");
  await wait("location.hash === '#sampling' && document.querySelector('input[aria-label=\"Sampling rate fs (Hz)\"]')");
  await click('Restore save');
  await wait(challengeStatus('Challenge complete'));
  await wait("document.querySelector('.js-plotly-plot .main-svg')");
  await evaluate("document.querySelector('.plot-export').click()");
  const png = await waitUntil(async () => (await fs.readdir(downloadPath)).find(name => name.endsWith('.png')),
    'the active chart exports to PNG');
  assert.ok((await fs.stat(path.join(downloadPath, png))).size > 1000);
  return { laplaceSliceRestored: true, checkpointRestored: true, challengeComplete: true, plotTeardownDeferred: true, plotExported: true };
};
