const assert = require('node:assert/strict');

module.exports = async ({ evaluate, send, wait, waitUntil }) => {
  await wait("document.querySelectorAll('.js-plotly-plot').length > 0");
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))");
  await wait("location.hash === '#laplace' && document.querySelector('.js-plotly-plot canvas')");
  await evaluate("document.querySelector('.lang-btn[title=English]').click(); window.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }))");
  await wait("location.hash === '#sampling' && document.querySelector('input[aria-label=\"Sampling rate fs (Hz)\"]')");
  const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)}).click()`);
  const challengeStatus = phrase => `document.querySelector('[role=status] .badge')?.textContent.includes(${JSON.stringify(phrase)})`;
  const setRate = rate => evaluate(`(() => {
    const slider = document.querySelector('input[aria-label="Sampling rate fs (Hz)"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, '${rate}');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
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
  await setRate(17);
  await wait(challengeStatus('exceeds the sampling budget'));
  await setRate(15.2);
  await wait(challengeStatus('Challenge complete'));
  await click('Save locally');
  await wait("document.querySelector('.snapshot-msg')?.textContent.includes('saved locally')");
  await evaluate('window.signalsReloadMarker = true');
  await send('Page.reload');
  await waitUntil(
    () => evaluate("!window.signalsReloadMarker && Boolean(document.querySelector('.snapshot-io'))").catch(() => false),
    'the sampling module reloads',
  );
  await click('Restore save');
  await wait(challengeStatus('Challenge complete'));
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Sampling rate fs (Hz)"]').value`), '15.2');
  return { checkpointRestored: true, challengeComplete: true };
};
