/*
 * 維修案例：build 時把 CMS 的案例（圖片＋說明文案）直接寫進 portfolio.html
 * （CASES:START / CASES:END 之間），讓搜尋引擎不必執行 JS 就讀得到內容。
 * 資料來源是 generate-articles.js 產出的 site-config.json（已套用 WebP 路徑與純文字標題）。
 */
const fs = require('fs');
const path = require('path');
const AR = require('../js/article-render.js');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'portfolio.html');
const START = '<!-- CASES:START -->';
const END = '<!-- CASES:END -->';

function readCases() {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'site-config.json'), 'utf8'));
    const cases = config.portfolio && config.portfolio.cases;
    return Array.isArray(cases) ? cases : [];
  } catch (err) {
    console.warn(`[cases] 無法讀取 site-config.json：${err.message}`);
    return [];
  }
}

function main() {
  if (!fs.existsSync(PAGE)) return;
  const html = fs.readFileSync(PAGE, 'utf8');
  const s = html.indexOf(START);
  const e = html.indexOf(END);
  if (s === -1 || e === -1 || e < s) {
    console.warn('[cases] portfolio.html 找不到 CASES:START / CASES:END 標記，略過。');
    return;
  }

  const cases = readCases().filter((c) => c && (c.image || c.title));
  cases.forEach((c, i) => {
    if (!c.image) console.warn(`[cases][warn] 第 ${i + 1} 筆案例沒有圖片。`);
    if (c.image && !String(c.alt || '').trim()) console.warn(`[cases][warn] 「${c.title || i + 1}」沒有填圖片描述（alt），將以標題代替。`);
  });

  const block = cases.length
    ? '\n' + cases.map((c, i) => AR.renderCaseCard(c, { index: i })).join('\n') + '\n'
    : '\n<p class="case-empty">目前沒有維修案例。</p>\n';

  const next = html.slice(0, s + START.length) + block + html.slice(e);
  if (next !== html) fs.writeFileSync(PAGE, next);
  const withText = cases.filter((c) => AR.stripHtml(c.body || '').length > 0).length;
  console.log(`[cases] 已寫入 ${cases.length} 筆維修案例（${withText} 筆含說明文案）`);
}

main();
