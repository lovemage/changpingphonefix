const fs = require('fs');
const path = require('path');

// 文章（_posts）改由 scripts/build-news.js 產生靜態頁面、sitemap 與 articles.json

// 簡單的 YAML 解析器（僅支援基本格式）
function parseSimpleYaml(content) {
    const result = {};
    const lines = content.split('\n');
    let currentArray = null;
    let currentArrayKey = null;

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;

        if (line.endsWith(':') && !line.includes(' ')) {
            // 陣列開始
            currentArrayKey = line.slice(0, -1);
            currentArray = [];
            result[currentArrayKey] = currentArray;
        } else if (line.startsWith('- ') && currentArray) {
            // 陣列項目
            const item = {};
            const itemContent = line.substring(2);
            if (itemContent.includes(':')) {
                const [key, value] = itemContent.split(':', 2);
                item[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
            }
            currentArray.push(item);
        } else if (line.includes(':')) {
            // 一般鍵值對
            const [key, ...valueParts] = line.split(':');
            const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');

            if (currentArray && currentArray.length > 0) {
                // 添加到當前陣列項目
                const lastItem = currentArray[currentArray.length - 1];
                lastItem[key.trim()] = value;
            } else {
                // 添加到根對象
                result[key.trim()] = value;
                currentArray = null;
                currentArrayKey = null;
            }
        }
    }

    return result;
}

// 把 CMS 貼上的 markdown 轉成純文字，避免畫面出現 ** 或落落長的 alt
function toPlainText(value, maxLength) {
    if (typeof value !== 'string') return value;
    let text = value
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/^\s*#+\s*/gm, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (maxLength && text.length > maxLength) {
        text = text.slice(0, maxLength).trim() + '…';
    }
    return text;
}

// 生成網站配置 JSON
function generateSiteConfig() {
    try {
        const config = {};

        // 讀取首頁配置
        const homepagePath = path.join(__dirname, '_data', 'homepage.yml');
        if (fs.existsSync(homepagePath)) {
            const homepageContent = fs.readFileSync(homepagePath, 'utf8');
            config.homepage = parseSimpleYaml(homepageContent);
        }

        // 讀取聯絡資訊
        const contactPath = path.join(__dirname, '_data', 'contact.yml');
        if (fs.existsSync(contactPath)) {
            const contactContent = fs.readFileSync(contactPath, 'utf8');
            config.contact = parseSimpleYaml(contactContent);
        }

        // 讀取維修案例
        const portfolioPath = path.join(__dirname, '_data', 'portfolio.yml');
        if (fs.existsSync(portfolioPath)) {
            const portfolioContent = fs.readFileSync(portfolioPath, 'utf8');
            config.portfolio = parseSimpleYaml(portfolioContent);
        }

        // CMS 傳進來的文字一律轉純文字，避免 ** 或超長 alt 直接顯示
        if (config.homepage) {
            ['site_title', 'main_heading', 'sub_heading', 'description'].forEach((key) => {
                if (config.homepage[key]) config.homepage[key] = toPlainText(config.homepage[key]);
            });
        }
        if (config.contact) {
            ['address', 'phone', 'business_hours'].forEach((key) => {
                if (config.contact[key]) config.contact[key] = toPlainText(config.contact[key]);
            });
        }
        if (config.portfolio && Array.isArray(config.portfolio.cases)) {
            config.portfolio.cases.forEach((item) => {
                if (item.title) item.title = toPlainText(item.title, 60);
                if (item.alt) item.alt = toPlainText(item.alt, 90);
            });
        }

        // 套用 WebP 對照表（CMS 上傳的圖片由 scripts/optimize-images.js 轉檔）
        const mapPath = path.join(__dirname, '.image-map.json');
        if (fs.existsSync(mapPath)) {
            const imageMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
            const swap = (value) => (typeof value === 'string' && imageMap[value] ? imageMap[value].webp : value);
            if (config.homepage) {
                ['hero_background_1', 'hero_background_2', 'about_image'].forEach((key) => {
                    if (config.homepage[key]) config.homepage[key] = swap(config.homepage[key]);
                });
            }
            if (config.portfolio && Array.isArray(config.portfolio.cases)) {
                config.portfolio.cases.forEach((item) => {
                    if (item.image) item.image = swap(item.image);
                });
            }
        }

        // 寫入配置文件
        fs.writeFileSync(path.join(__dirname, 'site-config.json'), JSON.stringify(config, null, 2));
        console.log('Generated site-config.json');

    } catch (error) {
        console.error('Error generating site config:', error);
    }
}

// 執行生成
generateSiteConfig();
