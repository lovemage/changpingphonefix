/*
 * 文章渲染與 SEO 檢查（共用模組）
 * - Node 建置腳本（generate-articles.js）用來產生靜態文章頁
 * - CMS 後台預覽（admin/cms.js）用來即時預覽，確保預覽與前台一致
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ArticleRender = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SITE = {
    name: '昌平手機維修',
    url: 'https://cp-phonefix.com',
    logo: '/images/logo300.png',
    titleSuffix: '｜昌平手機維修',
    defaultImage: '/images/about-img.jpg'
  };

  var SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripHtml(html) {
    return String(html || '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      // 行內標籤直接移除（避免「這是<strong>測試</strong>」變成「這是 測試 」），其餘標籤以空白分隔
      .replace(/<\/?(strong|b|em|i|u|s|a|span|code|small|mark|sub|sup|abbr)\b[^>]*>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 顯示寬度：中日韓全形字算 2，半形算 1（Google 搜尋結果截斷大致以像素寬度計）
  function displayWidth(text) {
    var width = 0;
    var str = String(text || '');
    for (var i = 0; i < str.length; i++) {
      width += /[⺀-￯]/.test(str.charAt(i)) ? 2 : 1;
    }
    return width;
  }

  function truncateByWidth(text, maxWidth) {
    var str = String(text || '');
    var width = 0;
    for (var i = 0; i < str.length; i++) {
      width += /[⺀-￯]/.test(str.charAt(i)) ? 2 : 1;
      if (width > maxWidth) return str.slice(0, i).replace(/[\s，。、；：,.;:]+$/, '') + '…';
    }
    return str;
  }

  function toDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function toIso(value) {
    var d = toDate(value);
    return d ? d.toISOString() : '';
  }

  function formatDate(value) {
    var d = toDate(value);
    if (!d) return '';
    try {
      var parts = new Intl.DateTimeFormat('zh-TW', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(d);
      var get = function (type) {
        for (var i = 0; i < parts.length; i++) if (parts[i].type === type) return parts[i].value;
        return '';
      };
      return get('year') + '/' + get('month') + '/' + get('day');
    } catch (e) {
      return d.toISOString().slice(0, 10).replace(/-/g, '/');
    }
  }

  function absoluteUrl(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return SITE.url + (path.charAt(0) === '/' ? '' : '/') + encodeURI(decodeURISafe(path));
  }

  function decodeURISafe(path) {
    try { return decodeURI(path); } catch (e) { return path; }
  }

  function articleUrl(slug) {
    return '/news/' + slug + '/';
  }

  function categoryUrl(slug) {
    return '/news/category/' + slug + '/';
  }

  function normalizeTags(tags) {
    if (!tags) return [];
    if (typeof tags === 'string') tags = tags.split(',');
    if (typeof tags.toJS === 'function') tags = tags.toJS();
    return tags.map(function (t) { return String(t).trim(); }).filter(Boolean);
  }

  /*
   * 整理內文 HTML，讓輸出符合 SEO 與效能慣例：
   * - 內文中的 <h1> 降為 <h2>（每頁只保留文章標題一個 H1）
   * - 圖片補 loading="lazy"、decoding="async"，缺 alt 時以文章標題補上
   * - iframe 補 loading="lazy"
   * - 表格外包可水平捲動的容器（手機版不撐破版面）
   * - 外部連結補 target="_blank" rel="noopener"
   */
  function processBodyHtml(html, options) {
    options = options || {};
    var title = options.title || '';
    var out = String(html || '');

    out = out.replace(/<h1(\s[^>]*)?>/gi, function (m, attrs) { return '<h2' + (attrs || '') + '>'; })
             .replace(/<\/h1>/gi, '</h2>');

    out = out.replace(/<img\b([^>]*?)\/?>/gi, function (m, attrs) {
      var a = attrs;
      if (!/\balt\s*=/i.test(a)) a += ' alt="' + escapeHtml(title) + '"';
      if (!/\bloading\s*=/i.test(a)) a += ' loading="lazy"';
      if (!/\bdecoding\s*=/i.test(a)) a += ' decoding="async"';
      return '<img' + a + '>';
    });

    out = out.replace(/<iframe\b([^>]*)>/gi, function (m, attrs) {
      return /\bloading\s*=/i.test(attrs) ? m : '<iframe' + attrs + ' loading="lazy">';
    });

    if (!/class="table-responsive"/.test(out)) {
      out = out.replace(/<table\b/gi, '<div class="table-responsive"><table')
               .replace(/<\/table>/gi, '</table></div>');
    }

    out = out.replace(/<a\b([^>]*?)>/gi, function (m, attrs) {
      var hrefMatch = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i);
      if (!hrefMatch) return m;
      var href = hrefMatch[1];
      var isExternal = /^https?:\/\//i.test(href) && href.indexOf(SITE.url) !== 0;
      if (!isExternal || /\btarget\s*=/i.test(attrs)) return m;
      return '<a' + attrs + ' target="_blank" rel="noopener">';
    });

    return out;
  }

  /*
   * 由文章原始資料整理出頁面需要的 SEO 欄位
   */
  function buildMeta(data) {
    var title = String(data.title || '').trim();
    var bodyText = stripHtml(data.bodyHtml || '');
    var description = String(data.seo_description || data.excerpt || '').trim() ||
      truncateByWidth(bodyText, 150);
    var seoTitle = String(data.seo_title || '').trim() || title;
    var fullTitle = seoTitle.indexOf(SITE.name) === -1 ? seoTitle + SITE.titleSuffix : seoTitle;
    var image = data.featured_image || SITE.defaultImage;
    var published = toIso(data.date);
    var modified = toIso(data.updated) || published;
    var tags = normalizeTags(data.tags);
    var category = data.category && data.categoryName
      ? { slug: String(data.category), name: String(data.categoryName), path: categoryUrl(data.category) }
      : null;

    return {
      title: title,
      seoTitle: seoTitle,
      fullTitle: fullTitle,
      description: description,
      excerpt: String(data.excerpt || '').trim() || truncateByWidth(bodyText, 150),
      image: image,
      imageAlt: String(data.featured_image_alt || '').trim() || title,
      published: published,
      modified: modified,
      tags: tags,
      category: category,
      slug: data.slug,
      path: articleUrl(data.slug),
      url: absoluteUrl(articleUrl(data.slug)),
      noindex: data.noindex === true,
      bodyText: bodyText
    };
  }

  function renderTags(tags) {
    if (!tags.length) return '';
    return '<ul class="article-tags" aria-label="文章標籤">' + tags.map(function (t) {
      return '<li>' + escapeHtml(t) + '</li>';
    }).join('') + '</ul>';
  }

  function renderBreadcrumb(title, category) {
    return '<nav class="article-breadcrumb" aria-label="麵包屑導覽"><ol>' +
      '<li><a href="/">首頁</a></li>' +
      '<li><a href="/news/">最新消息</a></li>' +
      (category ? '<li><a href="' + escapeHtml(category.path) + '">' + escapeHtml(category.name) + '</a></li>' : '') +
      '<li aria-current="page">' + escapeHtml(title) + '</li>' +
      '</ol></nav>';
  }

  function renderContactCta(contact) {
    contact = contact || {};
    var phone = contact.phone || '0970-805-995';
    var tel = phone.replace(/[^0-9+]/g, '');
    var address = contact.address || '台中市北屯區昌平路一段107之12號';
    var hours = contact.business_hours || '';
    return '<aside class="article-cta" aria-label="聯絡昌平手機維修">' +
      '<p class="article-cta-title">手機有狀況？現場免費檢測、誠實報價</p>' +
      '<p class="article-cta-info">' + escapeHtml(address) +
      (hours ? '<br>營業時間：' + escapeHtml(hours) : '') + '</p>' +
      '<div class="article-cta-actions">' +
      '<a class="article-btn article-btn-primary" href="tel:' + escapeHtml(tel) + '"><i class="fa fa-phone" aria-hidden="true"></i> 撥打 ' + escapeHtml(phone) + '</a>' +
      '<a class="article-btn" href="https://lin.ee/2vY34bQ" target="_blank" rel="noopener"><i class="fa fa-comment" aria-hidden="true"></i> LINE 詢問報價</a>' +
      '</div></aside>';
  }

  /*
   * 文章主體（麵包屑 + article），建置與後台預覽共用
   */
  function renderArticleMain(data, options) {
    options = options || {};
    var meta = buildMeta(data);
    var body = processBodyHtml(data.bodyHtml, { title: meta.title });
    var imageSrc = options.resolveAsset ? options.resolveAsset(data.featured_image) : data.featured_image;
    var modifiedLabel = data.updated && formatDate(data.updated) !== formatDate(data.date)
      ? '<span class="article-updated">更新於 <time datetime="' + escapeHtml(meta.modified) + '">' + formatDate(data.updated) + '</time></span>'
      : '';

    return renderBreadcrumb(meta.title, meta.category) +
      '<article class="article">' +
        '<header class="article-header">' +
          '<div class="article-meta">' +
            (meta.category ? '<a class="article-category" href="' + escapeHtml(meta.category.path) + '">' + escapeHtml(meta.category.name) + '</a>' : '') +
            '<time datetime="' + escapeHtml(meta.published) + '">' + formatDate(data.date) + '</time>' +
            modifiedLabel +
          '</div>' +
          '<h1 class="article-title">' + escapeHtml(meta.title) + '</h1>' +
          (meta.excerpt ? '<p class="article-lead">' + escapeHtml(meta.excerpt) + '</p>' : '') +
        '</header>' +
        (imageSrc
          ? '<figure class="article-cover"><img src="' + escapeHtml(imageSrc) + '" alt="' + escapeHtml(meta.imageAlt) + '" fetchpriority="high" decoding="async"></figure>'
          : '') +
        '<div class="article-body">' + body + '</div>' +
        '<footer class="article-footer">' +
          renderTags(meta.tags) +
          renderContactCta(options.contact) +
        '</footer>' +
      '</article>';
  }

  /*
   * 列表頁上方：分類切換 + 排序
   * categories: [{ slug, name, count }]，activeSlug 為空代表「全部」
   */
  function renderCategoryNav(categories, activeSlug, total, showSort) {
    function tab(href, label, count, active) {
      return '<li><a class="news-filter-link' + (active ? ' is-active' : '') + '" href="' + escapeHtml(href) + '"' +
        (active ? ' aria-current="page"' : '') + '>' + escapeHtml(label) +
        '<span class="news-filter-count">' + count + '</span></a></li>';
    }
    return '<div class="news-toolbar">' +
      '<nav class="news-filter" aria-label="文章分類"><ul>' +
        tab('/news/', '全部', total, !activeSlug) +
        categories.map(function (c) { return tab(categoryUrl(c.slug), c.name, c.count, c.slug === activeSlug); }).join('') +
      '</ul></nav>' +
      (showSort === false ? '' :
      '<div class="news-sort" role="group" aria-label="文章排序">' +
        '<span class="news-sort-label">排序</span>' +
        '<button type="button" class="news-sort-btn is-active" data-sort="newest" aria-pressed="true">由新到舊</button>' +
        '<button type="button" class="news-sort-btn" data-sort="oldest" aria-pressed="false">由舊到新</button>' +
      '</div>') +
    '</div>';
  }

  /*
   * 文章卡片（首頁與文章列表頁共用）
   */
  function renderCard(data, options) {
    options = options || {};
    var meta = buildMeta(data);
    var headingTag = options.headingTag || 'h3';
    return '<article class="news-card-item" data-date="' + escapeHtml(meta.published) + '"' + (data.pinned ? ' data-pinned="true"' : '') + '>' +
      '<a class="news-card-link" href="' + escapeHtml(meta.path) + '">' +
        (data.featured_image
          ? '<div class="news-card-image"><img src="' + escapeHtml(data.featured_image) + '" alt="' + escapeHtml(meta.imageAlt) + '" loading="lazy" decoding="async"></div>'
          : '') +
        '<div class="news-card-body">' +
          '<div class="news-card-meta">' +
          (meta.category ? '<span class="news-card-category">' + escapeHtml(meta.category.name) + '</span>' : '') +
          '<time datetime="' + escapeHtml(meta.published) + '">' + formatDate(data.date) + '</time>' +
          (data.pinned ? '<span class="news-card-pinned">置頂</span>' : '') + '</div>' +
          '<' + headingTag + ' class="news-card-title">' + escapeHtml(meta.title) + '</' + headingTag + '>' +
          '<p class="news-card-excerpt">' + escapeHtml(truncateByWidth(meta.excerpt, 110)) + '</p>' +
          '<span class="news-card-more">閱讀全文 <i class="fa fa-arrow-right" aria-hidden="true"></i></span>' +
        '</div>' +
      '</a>' +
    '</article>';
  }

  /*
   * 維修案例卡片（portfolio.html 與後台預覽共用）
   * item: { title, image, category, alt, body }
   * options: { index, resolveAsset, expanded }
   */
  var CASE_CATEGORIES = { iphone: '蘋果手機', android: '安卓手機', tablet: '平板', laptop: '電腦' };

  function renderCaseCard(item, options) {
    options = options || {};
    var resolve = options.resolveAsset || function (p) { return p; };
    var index = options.index || 0;
    var title = String(item.title || '').trim();
    var category = CASE_CATEGORIES[item.category] ? item.category : 'iphone';
    var alt = String(item.alt || '').trim() || title;
    var image = item.image ? resolve(item.image) : '';
    var body = String(item.body || '')
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .trim();
    // 案例標題是 h2，說明裡的標題整體降一級（h1/h2→h3、h3→h4、h4 以下→h5）
    body = body.replace(/<(\/?)h([1-6])(\s[^>]*)?>/gi, function (m, close, level, attrs) {
      var next = Math.min(Math.max(Number(level) + 1, 3), 5);
      return '<' + close + 'h' + next + (close ? '' : (attrs || '')) + '>';
    });
    var hasBody = stripHtml(body).length > 0 || /<(img|iframe|table)\b/i.test(body);
    var bodyId = 'case-body-' + (index + 1);

    return '<div class="iso-box ' + category + ' col-lg-4 col-md-4 col-sm-6">' +
      '<article class="case-card">' +
        (image
          ? '<a class="case-media" href="' + escapeHtml(image) + '" data-lightbox-gallery="portfolio-gallery" title="' + escapeHtml(title) + '">' +
              '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(alt) + '" loading="lazy" decoding="async">' +
            '</a>'
          : '') +
        '<div class="case-text">' +
          '<p class="case-category">' + CASE_CATEGORIES[category] + '</p>' +
          (title ? '<h2 class="case-title">' + escapeHtml(title) + '</h2>' : '') +
          (hasBody
            ? '<div class="case-body' + (options.expanded ? '' : ' is-clamped') + '" id="' + bodyId + '">' +
                processBodyHtml(body, { title: title }) +
              '</div>' +
              (options.expanded ? '' : '<button type="button" class="case-toggle" aria-expanded="false" aria-controls="' + bodyId + '" hidden>展開全文</button>')
            : '') +
        '</div>' +
      '</article>' +
    '</div>';
  }

  /*
   * SEO 檢查：回傳 [{ level: 'error' | 'warn' | 'ok', msg }]
   * error 會阻擋該文章建置（例如網址代稱錯誤），warn 只提醒
   */
  function seoAudit(data) {
    var results = [];
    var meta = buildMeta(data);
    var body = String(data.bodyHtml || '');
    function add(level, msg) { results.push({ level: level, msg: msg }); }

    if (!meta.title) add('error', '缺少文章標題。');

    if (!data.category) add('error', '請選擇文章分類。');
    else if (meta.category) add('ok', '分類：' + meta.category.name);

    if (!data.slug) add('error', '缺少網址代稱（slug）。');
    else if (!SLUG_PATTERN.test(data.slug)) add('error', '網址代稱只能使用英文小寫、數字與連字號，例如 iphone-battery-replace。');
    else add('ok', '網址：' + meta.path);

    var titleWidth = displayWidth(meta.fullTitle);
    if (titleWidth > 64) add('warn', 'SEO 標題約 ' + Math.ceil(titleWidth / 2) + ' 字，超過約 32 個中文字可能在搜尋結果被截斷。');
    else if (displayWidth(meta.seoTitle) < 16) add('warn', 'SEO 標題偏短，建議 12～28 個中文字並包含主要關鍵字。');
    else add('ok', 'SEO 標題長度適中。');

    var descWidth = displayWidth(meta.description);
    if (!data.seo_description && !data.excerpt) add('warn', '尚未填寫摘要或 SEO 描述，目前會自動擷取內文開頭。');
    if (descWidth > 240) add('warn', 'SEO 描述約 ' + Math.ceil(descWidth / 2) + ' 字，超過約 120 個中文字會在搜尋結果被截斷。');
    else if (descWidth < 100) add('warn', 'SEO 描述偏短，建議 50～120 個中文字，說明文章重點並自然帶入關鍵字。');
    else add('ok', 'SEO 描述長度適中。');

    if (!data.featured_image) add('warn', '沒有特色圖片，社群分享時會使用網站預設圖片。');
    else if (!String(data.featured_image_alt || '').trim()) add('warn', '特色圖片缺少替代文字（alt），目前以標題代替。');
    else add('ok', '特色圖片與替代文字已設定。');

    if (/<h1[\s>]/i.test(body)) add('warn', '內文含有「標題 1」，發佈時會自動改為「標題 2」（每頁只能有一個 H1）。');
    if (!/<h2[\s>]/i.test(body) && !/<h1[\s>]/i.test(body)) add('warn', '內文沒有小標題（標題 2），建議用小標題分段，方便閱讀與搜尋引擎理解。');

    var imgs = body.match(/<img\b[^>]*>/gi) || [];
    var noAlt = imgs.filter(function (tag) { return !/\balt\s*=\s*["'][^"']+["']/i.test(tag); }).length;
    if (noAlt) add('warn', '內文有 ' + noAlt + ' 張圖片缺少替代文字（alt），請在圖片設定中描述圖片內容。');

    var textLength = meta.bodyText.replace(/\s/g, '').length;
    if (textLength < 300) add('warn', '內文約 ' + textLength + ' 字，建議至少 300 字，內容較完整較容易被搜尋引擎收錄。');
    else add('ok', '內文約 ' + textLength + ' 字。');

    if (/<script[\s>]/i.test(body)) add('warn', '內文含有 <script>，請確認來源可信任。');

    if (meta.noindex) add('warn', '已勾選「不讓搜尋引擎收錄」，這篇文章不會出現在 Google 搜尋結果。');

    return results;
  }

  return {
    SITE: SITE,
    SLUG_PATTERN: SLUG_PATTERN,
    escapeHtml: escapeHtml,
    stripHtml: stripHtml,
    displayWidth: displayWidth,
    truncateByWidth: truncateByWidth,
    formatDate: formatDate,
    toIso: toIso,
    absoluteUrl: absoluteUrl,
    articleUrl: articleUrl,
    categoryUrl: categoryUrl,
    renderCategoryNav: renderCategoryNav,
    normalizeTags: normalizeTags,
    processBodyHtml: processBodyHtml,
    buildMeta: buildMeta,
    renderArticleMain: renderArticleMain,
    renderCard: renderCard,
    renderCaseCard: renderCaseCard,
    CASE_CATEGORIES: CASE_CATEGORIES,
    seoAudit: seoAudit
  };
});
