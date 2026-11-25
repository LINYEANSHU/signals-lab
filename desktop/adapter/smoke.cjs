module.exports = async ({ evaluate, wait }) => {
  await wait("document.querySelectorAll('.js-plotly-plot').length > 0");
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))");
  await wait("location.hash === '#laplace' && document.querySelector('.js-plotly-plot canvas')");
};
