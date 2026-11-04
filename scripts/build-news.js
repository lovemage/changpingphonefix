/*
 * 最新消息（_posts）建置腳本
 * 產出：
 *   /news/<slug>/index.html   每篇文章的靜態頁（完整 SEO meta、Open Graph、JSON-LD）
 *   /news/index.html          文章列表頁
 *   /news/feed.xml            RSS
 *   /sitemap.xml              全站 sitemap（含文章與圖片）
 *   /articles.json            文章資料（不含內文，供其他程式使用）
 *   /index.html               首頁「最新消息」區塊（NEWS:START / NEWS:END 之間）改為靜態 HTML
 */
'use strict';

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const AR = require('../js/article-render.js');

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, '_posts');
const NEWS_DIR = path.join(ROOT, 'news');
const SITE = AR.SITE;
const HOME_NEWS_LIMIT = 4;

let markedParse = null;

async function loadMarked() {
  if (!markedParse) {
    const { marked } = await import('marked');
    markedParse = (md) => marked.parse(md, { gfm: true, breaks: false });
  }
  return markedParse;
}

function readYaml(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return {};
  try {
    return yaml.load(fs.readFileSync(full, 'utf8')) || {};
  } catch (err) {
    console.warn(`[news] 無法解析 ${file}：${err.message}`);
    return {};
  }
}

const MAX_CATEGORIES = 5;

// 文章分類（後台「文章分類」管理，最多 5 個）
function readCategories() {
  const data = readYaml('_data/news_categories.yml');
  const list = Array.isArray(data.categories) ? data.categories : [];
  const seen = new Set();
  const out = [];
  list.forEach((c) => {
    const name = String((c && c.name) || '').trim();
    const slug = String((c && c.slug) || '').trim();
    if (!name || !AR.SLUG_PATTERN.test(slug)) {
      console.warn(`[news] 分類「${name || slug}」名稱或網址代稱格式不符，略過。`);
      return;
    }
    if (seen.has(slug)) return;
    seen.add(slug);
    out.push({ name, slug, description: String(c.description || '').trim() });
  });
  if (out.length > MAX_CATEGORIES) {
    console.warn(`[news] 分類超過 ${MAX_CATEGORIES} 個，只使用前 ${MAX_CATEGORIES} 個。`);
  }
  return out.slice(0, MAX_CATEGORIES);
}

function parseFrontMatter(raw) {
  const match = raw.replace(/^\uFEFF/, '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/);
  if (!match) return null;
  return { data: yaml.load(match[1]) || {}, body: match[2] || '' };
}

function slugFromFilename(filename) {
  const m = filename.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
  return (m ? m[1] : filename.replace(/\.md$/, '')).trim();
}

async function loadPosts(categories) {
  const categoryMap = new Map(categories.map((c) => [c.slug, c]));
  if (!fs.existsSync(POSTS_DIR)) return [];
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).sort();
  const posts = [];
  const usedSlugs = new Set();

  for (const filename of files) {
    let parsed;
    try {
      parsed = parseFrontMatter(fs.readFileSync(path.join(POSTS_DIR, filename), 'utf8'));
    } catch (err) {
      console.error(`[news] ${filename} 讀取失敗：${err.message}`);
      continue;
    }
    if (!parsed) {
      console.error(`[news] ${filename} 缺少 front matter，略過。`);
      continue;
    }

    const data = parsed.data;
    if (data.published === false) continue;

    let slug = String(data.slug || '').trim() || slugFromFilename(filename);
    if (!AR.SLUG_PATTERN.test(slug)) {
      console.error(`[news] ${filename} 網址代稱「${slug}」格式不符（只能用英文小寫、數字與連字號），略過。`);
      continue;
    }
    if (usedSlugs.has(slug)) {
      const fixed = `${slug}-${posts.length + 1}`;
      console.warn(`[news] 網址代稱「${slug}」重複，${filename} 改用「${fixed}」。`);
      slug = fixed;
    }
    usedSlugs.add(slug);

    let bodyHtml = parsed.body.trim();
    if (data.format === 'markdown') {
      bodyHtml = (await loadMarked())(bodyHtml);
    }

    const category = categoryMap.get(String(data.category || '').trim());
    if (!category) {
      console.warn(`[news][warn] ${filename}：${data.category ? `分類「${data.category}」不存在` : '尚未選擇分類'}，只會出現在「全部」。`);
    }

    const post = {
      ...data,
      category: category ? category.slug : '',
      categoryName: category ? category.name : '',
      slug,
      tags: AR.normalizeTags(data.tags),
      date: AR.toIso(data.date) || new Date().toISOString(),
      updated: AR.toIso(data.updated) || '',
      bodyHtml,
      filename
    };

    AR.seoAudit(post)
      .filter((r) => r.level !== 'ok')
      .forEach((r) => console.log(`[news][${r.level}] ${filename}：${r.msg}`));

    posts.push(post);
  }

  posts.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.date) - new Date(a.date);
  });
  return posts;
}

/* ---------- 共用版型 ---------- */

function jsonLdScript(data) {
  // 避免內容中的 </script> 截斷 JSON-LD
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function renderNavbar() {
  const links = [
    ['/#home', '首頁'],
    ['/#work', '服務項目'],
    ['/#about', '關於我們'],
    ['/news/', '最新消息', true],
    ['/portfolio.html', '維修案例'],
    ['/#reviews', '客戶評論'],
    ['/#contact', '聯絡我們']
  ];
  return `<header class="navbar navbar-fixed-top custom-navbar top-nav-collapse" role="navigation">
	<div class="container">
		<div class="navbar-header">
			<button class="navbar-toggle" data-toggle="collapse" data-target=".navbar-collapse" aria-label="開啟選單">
				<span class="icon icon-bar"></span>
				<span class="icon icon-bar"></span>
				<span class="icon icon-bar"></span>
			</button>
			<a href="/" class="navbar-brand">
				<img src="/800logo-w.png" alt="昌平手機維修" class="logo-img" width="40" height="40">
				<span class="brand-text">昌平手機維修</span>
			</a>
		</div>
		<nav class="collapse navbar-collapse" aria-label="主選單">
			<ul class="nav navbar-nav navbar-right">
${links.map(([href, label, active]) => `				<li${active ? ' class="active"' : ''}><a href="${href}"${active ? ' aria-current="page"' : ''}>${label}</a></li>`).join('\n')}
			</ul>
		</nav>
	</div>
</header>`;
}

function renderFooter(contact) {
  const phone = contact.phone || '0970-805-995';
  const tel = phone.replace(/[^0-9+]/g, '');
  const address = contact.address || '台中市北屯區昌平路一段107之12號';
  const fb = contact.facebook_url || 'https://www.facebook.com/profile.php?id=61579391294737';
  return `<footer>
	<div class="container">
		<div class="row">
			<div class="col-md-12 col-sm-12">
				<div class="footer-logo">
					<img src="/images/logo300.png" alt="昌平手機維修" class="footer-logo-img" loading="lazy">
				</div>
				<p>Copyright © 昌平手機維修 | ${AR.escapeHtml(address)} | 電話: ${AR.escapeHtml(phone)}</p>
				<hr>
				<ul class="social-icon">
					<li><a href="tel:${tel}" class="fa fa-phone" title="撥打電話" aria-label="撥打電話"></a></li>
					<li><a href="https://lin.ee/2vY34bQ" target="_blank" rel="noopener" class="fa fa-comment" title="LINE客服" aria-label="LINE客服"></a></li>
					<li><a href="${AR.escapeHtml(fb)}" target="_blank" rel="noopener" class="fa fa-facebook" title="Facebook粉絲頁" aria-label="Facebook粉絲頁"></a></li>
					<li><a href="https://maps.google.com/?q=${encodeURIComponent(address)}" target="_blank" rel="noopener" class="fa fa-map-marker" title="Google地圖" aria-label="Google地圖"></a></li>
				</ul>
			</div>
		</div>
	</div>
</footer>
<div class="floating-buttons">
	<a href="tel:${tel}" class="floating-btn phone" title="撥打電話 ${AR.escapeHtml(phone)}" aria-label="撥打電話"><i class="fa fa-phone" aria-hidden="true"></i></a>
	<a href="https://lin.ee/2vY34bQ" target="_blank" rel="noopener" class="floating-btn line" title="LINE 報價維修" aria-label="LINE 報價維修"><i class="fa fa-comment" aria-hidden="true"></i></a>
</div>`;
}

function renderPage(opts) {
  const e = AR.escapeHtml;
  const image = AR.absoluteUrl(opts.image || SITE.defaultImage);
  const robots = opts.noindex
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  const articleOg = opts.article
    ? [
        `<meta property="article:published_time" content="${e(opts.article.published)}">`,
        `<meta property="article:modified_time" content="${e(opts.article.modified)}">`,
        `<meta property="article:author" content="${e(SITE.name)}">`,
        ...(opts.article.section ? [`<meta property="article:section" content="${e(opts.article.section)}">`] : []),
        ...opts.article.tags.map((t) => `<meta property="article:tag" content="${e(t)}">`)
      ].join('\n\t')
    : '';

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>${e(opts.title)}</title>
	<meta name="description" content="${e(opts.description)}">
	<meta name="robots" content="${robots}">
	<link rel="canonical" href="${e(opts.canonical)}">
	<link rel="alternate" type="application/rss+xml" title="昌平手機維修 最新消息" href="${SITE.url}/news/feed.xml">
	<meta property="og:locale" content="zh_TW">
	<meta property="og:site_name" content="${e(SITE.name)}">
	<meta property="og:type" content="${opts.article ? 'article' : 'website'}">
	<meta property="og:title" content="${e(opts.ogTitle || opts.title)}">
	<meta property="og:description" content="${e(opts.description)}">
	<meta property="og:url" content="${e(opts.canonical)}">
	<meta property="og:image" content="${e(image)}">
	<meta property="og:image:alt" content="${e(opts.imageAlt || opts.ogTitle || opts.title)}">
	${articleOg}
	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:title" content="${e(opts.ogTitle || opts.title)}">
	<meta name="twitter:description" content="${e(opts.description)}">
	<meta name="twitter:image" content="${e(image)}">
	<link rel="icon" type="image/png" href="/images/logo300.png">
	<link rel="apple-touch-icon" href="/images/logo300.png">
	${opts.preloadImage ? `<link rel="preload" as="image" href="${e(opts.preloadImage)}" fetchpriority="high">` : ''}
	<link rel="stylesheet" href="/css/bootstrap.min.css">
	<link rel="stylesheet" href="/css/font-awesome.min.css">
	<link rel="stylesheet" href="/css/style.css">
	<link rel="stylesheet" href="/css/article.css">
	${opts.jsonLd.map(jsonLdScript).join('\n\t')}
</head>
<body class="page-news">
${renderNavbar()}
<main id="main" class="news-page">
	<div class="container">
${opts.main}
	</div>
</main>
${renderFooter(opts.contact)}
<script src="/js/jquery.js" defer></script>
<script src="/js/bootstrap.min.js" defer></script>
${opts.script || ''}
</body>
</html>
`;
}

function organizationLd() {
  return {
    '@type': 'Organization',
    name: SITE.name,
    url: SITE.url + '/',
    logo: { '@type': 'ImageObject', url: AR.absoluteUrl(SITE.logo) }
  };
}

/* ---------- 文章頁 ---------- */

function renderArticlePage(post, related, contact) {
  const meta = AR.buildMeta(post);
  const main = AR.renderArticleMain(post, { contact });

  const relatedHtml = related.length
    ? `<section class="article-related" aria-labelledby="related-heading">
	<h2 id="related-heading" class="article-related-title">延伸閱讀</h2>
	<div class="news-card-grid">
		${related.map((p) => AR.renderCard(p, { headingTag: 'h3' })).join('\n\t\t')}
	</div>
</section>`
    : '';

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: meta.title,
      description: meta.description,
      image: [AR.absoluteUrl(meta.image)],
      datePublished: meta.published,
      dateModified: meta.modified,
      inLanguage: 'zh-TW',
      author: organizationLd(),
      publisher: organizationLd(),
      mainEntityOfPage: { '@type': 'WebPage', '@id': meta.url },
      url: meta.url,
      ...(meta.tags.length ? { keywords: meta.tags.join(', ') } : {}),
      ...(meta.category ? { articleSection: meta.category.name } : {}),
      wordCount: meta.bodyText.replace(/\s/g, '').length
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: SITE.url + '/' },
        { '@type': 'ListItem', position: 2, name: '最新消息', item: SITE.url + '/news/' },
        ...(meta.category ? [{ '@type': 'ListItem', position: 3, name: meta.category.name, item: AR.absoluteUrl(meta.category.path) }] : []),
        { '@type': 'ListItem', position: meta.category ? 4 : 3, name: meta.title, item: meta.url }
      ]
    }
  ];

  return renderPage({
    title: meta.fullTitle,
    ogTitle: meta.seoTitle,
    description: meta.description,
    canonical: meta.url,
    image: meta.image,
    imageAlt: meta.imageAlt,
    preloadImage: post.featured_image,
    noindex: meta.noindex,
    article: { published: meta.published, modified: meta.modified, tags: meta.tags, section: meta.category && meta.category.name },
    jsonLd,
    contact,
    main: main + relatedHtml
  });
}

/* ---------- 列表頁（全部／各分類） ---------- */

// 排序切換：由新到舊（置頂優先）／由舊到新，選擇會記住
const SORT_SCRIPT = `<script>
(function () {
	var grid = document.querySelector('[data-news-grid]');
	var buttons = document.querySelectorAll('.news-sort-btn');
	if (!grid || !buttons.length) return;
	var cards = Array.prototype.slice.call(grid.children);
	function time(el) { return Date.parse(el.getAttribute('data-date')) || 0; }
	function apply(mode) {
		var sorted = cards.slice().sort(function (a, b) {
			if (mode === 'oldest') return time(a) - time(b);
			var pa = a.hasAttribute('data-pinned'), pb = b.hasAttribute('data-pinned');
			if (pa !== pb) return pa ? -1 : 1;
			return time(b) - time(a);
		});
		sorted.forEach(function (el) { grid.appendChild(el); });
		Array.prototype.forEach.call(buttons, function (btn) {
			var on = btn.getAttribute('data-sort') === mode;
			btn.classList.toggle('is-active', on);
			btn.setAttribute('aria-pressed', on ? 'true' : 'false');
		});
	}
	var saved = 'newest';
	try { saved = localStorage.getItem('cpfix-news-sort') || 'newest'; } catch (e) {}
	if (saved === 'oldest') apply('oldest');
	Array.prototype.forEach.call(buttons, function (btn) {
		btn.addEventListener('click', function () {
			var mode = btn.getAttribute('data-sort');
			apply(mode);
			try { localStorage.setItem('cpfix-news-sort', mode); } catch (e) {}
		});
	});
})();
</script>`;

const INDEX_DESCRIPTION = '昌平手機維修最新消息：手機、平板、摺疊機維修知識、電池保養技巧、優惠活動與服務公告，台中北屯在地專業維修。';

function renderListPage({ posts, allPosts, categories, category, contact }) {
  const listed = posts.filter((p) => p.noindex !== true);
  const pagePath = category ? AR.categoryUrl(category.slug) : '/news/';
  const url = AR.absoluteUrl(pagePath);
  const heading = category ? category.name : '最新消息與維修知識';
  const description = category
    ? (category.description || `昌平手機維修「${category.name}」相關文章，台中北屯在地專業手機、平板維修。`)
    : INDEX_DESCRIPTION;
  const lead = category
    ? (category.description || `「${category.name}」分類的所有文章。`)
    : '維修技術資訊、保養小撇步、優惠活動與服務公告。';

  const navCategories = categories
    .map((c) => ({ ...c, count: allPosts.filter((p) => p.category === c.slug).length }))
    .filter((c) => c.count > 0);

  const crumbs = category
    ? `<li><a href="/">首頁</a></li><li><a href="/news/">最新消息</a></li><li aria-current="page">${AR.escapeHtml(category.name)}</li>`
    : '<li><a href="/">首頁</a></li><li aria-current="page">最新消息</li>';

  const main = `<nav class="article-breadcrumb news-list-breadcrumb" aria-label="麵包屑導覽"><ol>${crumbs}</ol></nav>
<header class="news-index-header">
	<h1 class="news-index-title">${AR.escapeHtml(heading)}</h1>
	<p class="news-index-lead">${AR.escapeHtml(lead)}</p>
</header>
${navCategories.length ? AR.renderCategoryNav(navCategories, category ? category.slug : '', allPosts.length, posts.length > 1) : ''}
${posts.length
    ? `<div class="news-card-grid" data-news-grid>\n${posts.map((p) => AR.renderCard(p, { headingTag: 'h2' })).join('\n')}\n</div>`
    : '<p class="news-empty">目前沒有文章。</p>'}`;

  const breadcrumbLd = [
    { '@type': 'ListItem', position: 1, name: '首頁', item: SITE.url + '/' },
    { '@type': 'ListItem', position: 2, name: '最新消息', item: SITE.url + '/news/' }
  ];
  if (category) breadcrumbLd.push({ '@type': 'ListItem', position: 3, name: category.name, item: url });

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: heading,
      description,
      url,
      inLanguage: 'zh-TW',
      isPartOf: { '@type': 'WebSite', name: SITE.name, url: SITE.url + '/' },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: listed.map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: AR.absoluteUrl(AR.articleUrl(p.slug)),
          name: p.title
        }))
      }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbLd
    }
  ];

  return renderPage({
    title: (category ? `${category.name}｜最新消息` : '最新消息與維修知識') + SITE.titleSuffix,
    description,
    canonical: url,
    image: (posts[0] && posts[0].featured_image) || SITE.defaultImage,
    jsonLd,
    contact,
    main,
    script: posts.length > 1 ? SORT_SCRIPT : ''
  });
}

/* ---------- RSS ---------- */

function xmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function renderFeed(posts) {
  const items = posts
    .filter((p) => p.noindex !== true)
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 20)
    .map((p) => {
      const meta = AR.buildMeta(p);
      return `    <item>
      <title>${xmlEscape(meta.title)}</title>
      <link>${xmlEscape(meta.url)}</link>
      <guid isPermaLink="true">${xmlEscape(meta.url)}</guid>
      <pubDate>${new Date(meta.published).toUTCString()}</pubDate>
      <description>${xmlEscape(meta.description)}</description>
${[meta.category && meta.category.name, ...meta.tags].filter(Boolean).map((t) => `      <category>${xmlEscape(t)}</category>`).join('\n')}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>昌平手機維修 最新消息</title>
    <link>${SITE.url}/news/</link>
    <atom:link href="${SITE.url}/news/feed.xml" rel="self" type="application/rss+xml"/>
    <description>台中北屯手機維修知識、優惠活動與服務公告</description>
    <language>zh-TW</language>
${items}
  </channel>
</rss>
`;
}

/* ---------- Sitemap ---------- */

function renderSitemap(posts, homepage, portfolio, categories) {
  const indexable = posts.filter((p) => p.noindex !== true);
  const latest = indexable
    .map((p) => p.updated || p.date)
    .sort()
    .pop();
  const lastmod = latest ? latest.slice(0, 10) : '';

  const imageTag = (src, title) => src
    ? `\n    <image:image>\n      <image:loc>${xmlEscape(AR.absoluteUrl(src))}</image:loc>${title ? `\n      <image:title>${xmlEscape(title)}</image:title>` : ''}\n    </image:image>`
    : '';

  const urls = [];
  urls.push(`  <url>
    <loc>${SITE.url}/</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>${imageTag('/images/logo300.png', '昌平手機維修 Logo')}${imageTag(homepage.hero_background_1, '昌平手機維修服務展示')}${imageTag(homepage.hero_background_2, '專業手機維修技術')}${imageTag(homepage.about_image, '關於昌平手機維修')}
  </url>`);

  const cases = (portfolio && Array.isArray(portfolio.cases)) ? portfolio.cases : [];
  urls.push(`  <url>
    <loc>${SITE.url}/portfolio.html</loc>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>${cases.map((c) => imageTag(c.image, c.alt || c.title)).join('')}
  </url>`);

  urls.push(`  <url>
    <loc>${SITE.url}/news/</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);

  (categories || []).forEach((c) => {
    const inCat = indexable.filter((p) => p.category === c.slug);
    if (!inCat.length) return;
    const catLatest = inCat.map((p) => p.updated || p.date).sort().pop();
    urls.push(`  <url>
    <loc>${xmlEscape(AR.absoluteUrl(AR.categoryUrl(c.slug)))}</loc>
    <lastmod>${catLatest.slice(0, 10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`);
  });

  indexable.forEach((p) => {
    const meta = AR.buildMeta(p);
    urls.push(`  <url>
    <loc>${xmlEscape(meta.url)}</loc>
    <lastmod>${meta.modified.slice(0, 10)}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>${imageTag(p.featured_image, meta.imageAlt)}
  </url>`);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- 此檔案由 scripts/build-news.js 自動產生，請勿手動修改 -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>
`;
}

/* ---------- 首頁最新消息區塊 ---------- */

function injectHomepageNews(posts) {
  const file = path.join(ROOT, 'index.html');
  if (!fs.existsSync(file)) return;
  const html = fs.readFileSync(file, 'utf8');
  const start = '<!-- NEWS:START -->';
  const end = '<!-- NEWS:END -->';
  const s = html.indexOf(start);
  const e = html.indexOf(end);
  if (s === -1 || e === -1 || e < s) {
    console.warn('[news] index.html 找不到 NEWS:START / NEWS:END 標記，略過首頁區塊。');
    return;
  }
  const items = posts.slice(0, HOME_NEWS_LIMIT);
  const block = items.length
    ? `\n<div class="news-card-grid">\n${items.map((p) => AR.renderCard(p, { headingTag: 'h3' })).join('\n')}\n</div>\n<p class="news-more-wrap"><a class="article-btn article-btn-primary" href="/news/">查看全部最新消息</a></p>\n`
    : '\n<p class="news-empty">目前沒有最新消息。</p>\n';
  const next = html.slice(0, s + start.length) + block + html.slice(e);
  if (next !== html) fs.writeFileSync(file, next);
}

/* ---------- 主流程 ---------- */

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) || {};
  } catch (err) {
    return {};
  }
}

async function main() {
  const contact = readYaml('_data/contact.yml');
  // 首頁與案例圖片改讀 generate-articles.js 產出的 site-config.json（已套用 WebP 路徑與純文字 alt）
  const siteConfig = readJson('site-config.json');
  const homepage = siteConfig.homepage || readYaml('_data/homepage.yml');
  const portfolio = siteConfig.portfolio || readYaml('_data/portfolio.yml');
  const categories = readCategories();
  const posts = await loadPosts(categories);

  fs.rmSync(NEWS_DIR, { recursive: true, force: true });

  posts.forEach((post) => {
    const related = posts
      .filter((p) => p.slug !== post.slug && p.noindex !== true)
      .sort((a, b) => {
        const score = (p) => (post.category && p.category === post.category ? 10 : 0) +
          p.tags.filter((t) => post.tags.includes(t)).length;
        return score(b) - score(a) || new Date(b.date) - new Date(a.date);
      })
      .slice(0, 3);
    writeFile(path.join(NEWS_DIR, post.slug, 'index.html'), renderArticlePage(post, related, contact));
  });

  writeFile(path.join(NEWS_DIR, 'index.html'), renderListPage({ posts, allPosts: posts, categories, category: null, contact }));
  let categoryPages = 0;
  categories.forEach((category) => {
    const inCategory = posts.filter((p) => p.category === category.slug);
    if (!inCategory.length) return;
    categoryPages += 1;
    writeFile(
      path.join(NEWS_DIR, 'category', category.slug, 'index.html'),
      renderListPage({ posts: inCategory, allPosts: posts, categories, category, contact })
    );
  });
  // 後台預覽用：分類名稱對照
  writeFile(path.join(NEWS_DIR, 'categories.json'), JSON.stringify(categories.map((c) => ({ slug: c.slug, name: c.name }))) + '\n');
  writeFile(path.join(NEWS_DIR, 'feed.xml'), renderFeed(posts));
  writeFile(path.join(ROOT, 'sitemap.xml'), renderSitemap(posts, homepage, portfolio, categories));
  writeFile(
    path.join(ROOT, 'articles.json'),
    JSON.stringify(posts.map((p) => {
      const meta = AR.buildMeta(p);
      return {
        title: meta.title,
        slug: p.slug,
        url: meta.path,
        date: meta.published,
        updated: meta.modified,
        excerpt: meta.excerpt,
        featured_image: p.featured_image || null,
        tags: meta.tags,
        category: meta.category ? meta.category.name : null,
        pinned: p.pinned === true
      };
    }), null, 2) + '\n'
  );
  injectHomepageNews(posts);

  console.log(`[news] 已產生 ${posts.length} 篇文章頁、列表頁、${categoryPages} 個分類頁、RSS 與 sitemap.xml`);
}

main().catch((err) => {
  console.error('[news] 建置失敗：', err);
  process.exit(1);
});
