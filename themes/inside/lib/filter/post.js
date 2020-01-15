const cheerio = require('cheerio');
const bounded = '<div class="bounded"></div>';
const table = '<div class="table"></div>';
const { snippet } = require('../utils');

module.exports = function (data) {
  const $ = cheerio.load(data.content, { decodeEntities: false });

  // optimize table display
  $.root().children('table')
    // remove empty thead
    .each(function () {
      const $thead = $(this).children('thead');
      if (!$thead.find('th').map((_, el) => $(el).html()).get().join('').replace(/\&nbsp;/g, '').trim()) $thead.remove();
    })
    .wrap(bounded).wrap(table);

  // wrap <script> with <div class="is-snippet">
  $.root().children('script').each(function () {
    const $script = $(this),
      // src = $script.attr('src'),
      html = $script.html().trim();

    if (html) $script.replaceWith(snippet(html));
    // inline <script src=""> is not allowed
    // else if (src) $script.wrap(snippet(null, i => ''));
  })

  data.content = $.html();
};
