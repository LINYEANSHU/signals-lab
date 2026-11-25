const assert = require('node:assert/strict');

module.exports = async ({ evaluate, send, wait, waitUntil }) => {
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
  return { laplaceSliceRestored: true, checkpointRestored: true, challengeComplete: true };
};
