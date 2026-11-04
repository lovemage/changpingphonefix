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

function parseFrontMatter(raw) {
  const match = raw.replace(/^\uFEFF/, '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n([\s\S]*))?$/);
  if (!match) return null;
  return { data: yaml.load(match[1]) || {}, body: match[2] || '' };
}

function slugFromFilename(filename) {
  const m = filename.match(/^\d{4}-\d{2}-\d{2}-(.+)\.md$/);
  return (m ? m[1] : filename.replace(/\.md$/, '')).trim();
}

async function loadPosts() {
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

    const post = {
      ...data,
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
	<h2 id="related-heading" class="article-related-title">更多維修知識</h2>
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
      wordCount: meta.bodyText.replace(/\s/g, '').length
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: SITE.url + '/' },
        { '@type': 'ListItem', position: 2, name: '最新消息', item: SITE.url + '/news/' },
        { '@type': 'ListItem', position: 3, name: meta.title, item: meta.url }
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
    article: { published: meta.published, modified: meta.modified, tags: meta.tags },
    jsonLd,
    contact,
    main: main + relatedHtml
  });
}

/* ---------- 列表頁 ---------- */

function renderIndexPage(posts, contact) {
  const listed = posts.filter((p) => p.noindex !== true);
  const url = SITE.url + '/news/';
  const description = '昌平手機維修最新消息：手機、平板、摺疊機維修知識、電池保養技巧、優惠活動與服務公告，台中北屯在地專業維修。';

  const main = `<nav class="article-breadcrumb" aria-label="麵包屑導覽"><ol><li><a href="/">首頁</a></li><li aria-current="page">最新消息</li></ol></nav>
<header class="news-index-header">
	<h1 class="news-index-title">最新消息與維修知識</h1>
	<p class="news-index-lead">維修技術資訊、保養小撇步、優惠活動與服務公告。</p>
</header>
${posts.length
    ? `<div class="news-card-grid">\n${posts.map((p) => AR.renderCard(p, { headingTag: 'h2' })).join('\n')}\n</div>`
    : '<p class="news-empty">目前沒有最新消息。</p>'}`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: '最新消息與維修知識',
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
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: SITE.url + '/' },
        { '@type': 'ListItem', position: 2, name: '最新消息', item: url }
      ]
    }
  ];

  return renderPage({
    title: '最新消息與維修知識' + SITE.titleSuffix,
    description,
    canonical: url,
    image: (posts[0] && posts[0].featured_image) || SITE.defaultImage,
    jsonLd,
    contact,
    main
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
${meta.tags.map((t) => `      <category>${xmlEscape(t)}</category>`).join('\n')}
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

function renderSitemap(posts, homepage, portfolio) {
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
  const posts = await loadPosts();

  fs.rmSync(NEWS_DIR, { recursive: true, force: true });

  posts.forEach((post) => {
    const related = posts
      .filter((p) => p.slug !== post.slug && p.noindex !== true)
      .sort((a, b) => {
        const shared = (p) => p.tags.filter((t) => post.tags.includes(t)).length;
        return shared(b) - shared(a) || new Date(b.date) - new Date(a.date);
      })
      .slice(0, 3);
    writeFile(path.join(NEWS_DIR, post.slug, 'index.html'), renderArticlePage(post, related, contact));
  });

  writeFile(path.join(NEWS_DIR, 'index.html'), renderIndexPage(posts, contact));
  writeFile(path.join(NEWS_DIR, 'feed.xml'), renderFeed(posts));
  writeFile(path.join(ROOT, 'sitemap.xml'), renderSitemap(posts, homepage, portfolio));
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
        pinned: p.pinned === true
      };
    }), null, 2) + '\n'
  );
  injectHomepageNews(posts);

  console.log(`[news] 已產生 ${posts.length} 篇文章頁、列表頁、RSS 與 sitemap.xml`);
}

main().catch((err) => {
  console.error('[news] 建置失敗：', err);
  process.exit(1);
});
