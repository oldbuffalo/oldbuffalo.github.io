const path = require('path');
const fs = require('fs');
const { getAssetsName } = require('../utils');
const sources = fs.readdirSync(path.join(__dirname, '../../source'));
const pkg = require('../../package.json');
let cache;

module.exports = function (type) {
  if (!cache) {
    const lang = this.config.language || 'en';
    let cdn = this.theme.theme.cdn;

    if (cdn && cdn.match('jsdelivr')) cdn = `https://cdn.jsdelivr.net/npm/${pkg.name}@${pkg.version}/source`;

    const pathFn = cdn ? a => `${cdn}/${a}` : this.url_for.bind(this);

    cache = {
      css: css(getAssetsName(sources, 'css', ['styles']), pathFn),
      js: js(
        getAssetsName(sources, 'js', ['runtime', 'polyfills', 'main'])
          .filter(i => !i.match(/^main/) || i.indexOf(`${lang}.js`) !== -1),
          pathFn
      )
    }
  }

  return cache[type] || '';
}

function css(arr, fn) {
  return arr.map(s => `<link rel="stylesheet" href="${fn(s)}">`).join('\n')
}

function js(arr, fn) {
  return arr.map(s => `<script src="${fn(s)}"></script>`).join('\n')
}
