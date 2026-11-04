// 將 CMS 上傳的圖片（_data 內引用）自動轉成 WebP，並產生對照表給 site-config 使用
// 每次 build 執行；已轉過且來源未變動就跳過
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, '_data');
const MAP_FILE = path.join(ROOT, '.image-map.json');
const MAX_WIDTH = 1600;
const QUALITY = 82;
const CONVERTIBLE = new Set(['.png', '.jpg', '.jpeg']);

function readMap() {
  if (!fs.existsSync(MAP_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(MAP_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function hashFile(file) {
  return crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex');
}

function isAsciiName(name) {
  return /^[\x20-\x7E]+$/.test(name);
}

// 從 _data/*.yml 抓出所有 /images/ 開頭的圖片路徑
function collectImageRefs() {
  const refs = new Set();
  if (!fs.existsSync(DATA_DIR)) return refs;
  for (const name of fs.readdirSync(DATA_DIR)) {
    if (!name.endsWith('.yml') && !name.endsWith('.yaml')) continue;
    const text = fs.readFileSync(path.join(DATA_DIR, name), 'utf8');
    const matches = text.match(/\/images\/[^\s"']+/g) || [];
    matches.forEach((m) => refs.add(m.replace(/[",]+$/, '')));
  }
  return refs;
}

function outputNameFor(ref, srcFile) {
  const parsed = path.parse(ref);
  if (isAsciiName(parsed.name)) return `${parsed.name}.webp`;
  // 中文檔名改用內容雜湊，避免 URL 編碼問題
  const h = hashFile(srcFile).slice(0, 10);
  return `img-${h}.webp`;
}

async function main() {
  const map = readMap();
  const refs = collectImageRefs();
  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const ref of refs) {
    const ext = path.extname(ref).toLowerCase();
    if (!CONVERTIBLE.has(ext)) continue;

    const srcFile = path.join(ROOT, decodeURIComponent(ref));
    if (!fs.existsSync(srcFile)) {
      console.warn(`[images] 找不到 ${ref}，略過`);
      failed += 1;
      continue;
    }

    const hash = hashFile(srcFile);
    const existing = map[ref];
    if (existing && existing.hash === hash && fs.existsSync(path.join(ROOT, existing.webp))) {
      skipped += 1;
      continue;
    }

    const outName = outputNameFor(ref, srcFile);
    const outRel = `/images/${outName}`;
    const outFile = path.join(ROOT, 'images', outName);

    try {
      await sharp(srcFile)
        .rotate()
        .resize({ width: MAX_WIDTH, withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toFile(outFile);
      map[ref] = { webp: outRel, hash };
      converted += 1;
      console.log(`[images] ${ref} → ${outRel} (${Math.round(fs.statSync(outFile).size / 1024)} KB)`);
    } catch (error) {
      console.error(`[images] 轉換失敗 ${ref}: ${error.message}`);
      failed += 1;
    }
  }

  fs.writeFileSync(MAP_FILE, JSON.stringify(map, null, 2) + '\n');
  console.log(`[images] 轉換 ${converted}、跳過 ${skipped}、失敗 ${failed}`);
}

main().catch((error) => {
  console.error('[images] 未預期錯誤:', error);
  process.exitCode = 1;
});
