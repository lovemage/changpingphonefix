const fs = require('fs');
const path = require('path');

// 讀取 _posts 資料夾中的所有 markdown 文件
function generateArticlesJson() {
    const postsDir = path.join(__dirname, '_posts');
    const articles = [];

    try {
        const files = fs.readdirSync(postsDir);
        
        files.forEach(filename => {
            if (filename.endsWith('.md')) {
                try {
                    const filePath = path.join(postsDir, filename);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const article = parseMarkdownArticle(content, filename);
                    
                    if (article && article.published !== false) {
                        articles.push(article);
                    }
                } catch (error) {
                    console.error(`Error processing ${filename}:`, error);
                }
            }
        });

        // 按日期排序，置頂文章優先
        articles.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.date) - new Date(a.date);
        });

        // 寫入 JSON 文件
        fs.writeFileSync(path.join(__dirname, 'articles.json'), JSON.stringify(articles, null, 2));
        console.log(`Generated articles.json with ${articles.length} articles`);
        
    } catch (error) {
        console.error('Error generating articles.json:', error);
    }
}

function parseMarkdownArticle(content, filename) {
    try {
        // 解析 Front Matter
        const frontMatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
        if (!frontMatterMatch) {
            return null;
        }

        const frontMatter = frontMatterMatch[1];
        const body = frontMatterMatch[2];

        // 簡單的 YAML 解析
        const metadata = {};
        frontMatter.split('\n').forEach(line => {
            const match = line.match(/^(\w+):\s*(.+)$/);
            if (match) {
                const key = match[1];
                let value = match[2].trim();
                
                // 處理不同的數據類型
                if (value === 'true') value = true;
                else if (value === 'false') value = false;
                else if (value.startsWith('[') && value.endsWith(']')) {
                    // 簡單的陣列解析
                    value = value.slice(1, -1).split(',').map(item => item.trim().replace(/['"]/g, ''));
                } else if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                
                metadata[key] = value;
            }
        });

        // 從檔名提取日期和 slug
        const filenameMatch = filename.match(/(\d{4}-\d{2}-\d{2})-(.+)\.md$/);
        const slug = filenameMatch ? filenameMatch[2] : filename.replace('.md', '');

        return {
            title: metadata.title || '無標題',
            date: metadata.date || (filenameMatch ? filenameMatch[1] : new Date().toISOString().split('T')[0]),
            excerpt: metadata.excerpt || body.substring(0, 150) + '...',
            featured_image: metadata.featured_image || null,
            tags: metadata.tags || [],
            pinned: metadata.pinned || false,
            published: metadata.published !== false,
            slug: slug,
            body: body
        };
    } catch (error) {
        console.error('解析文章失敗:', error);
        return null;
    }
}

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

        // 寫入配置文件
        fs.writeFileSync(path.join(__dirname, 'site-config.json'), JSON.stringify(config, null, 2));
        console.log('Generated site-config.json');

    } catch (error) {
        console.error('Error generating site config:', error);
    }
}

// 執行生成
generateArticlesJson();
generateSiteConfig();
