let cache;

module.exports = function (id) {
  if (typeof cache === 'undefined') {
    if (!id) return '';

    cache = id ? [
      `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`,
      `<script>window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments)};gtag('js', new Date());gtag('config', '${id}');</script>`
    ].join('\n') : '';
  }

  return cache;
}
