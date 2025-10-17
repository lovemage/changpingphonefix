// 新聞文章管理
class NewsManager {
    constructor() {
        this.articles = [];
        this.container = document.getElementById('news-container');
        this.init();
    }

    async init() {
        await this.loadArticles();
        this.renderArticles();
    }

    async loadArticles() {
        try {
            // 嘗試從 articles.json 載入文章
            const response = await fetch('/articles.json');
            if (response.ok) {
                const articles = await response.json();
                if (articles.length > 0) {
                    this.articles = articles;
                    return;
                }
            }
        } catch (error) {
            console.warn('無法從 articles.json 載入文章:', error);
        }

        // 如果無法載入 JSON 文件，使用預設文章
        this.articles = [
            {
                title: "歡迎來到昌平手機維修",
                date: "2024-01-15",
                excerpt: "我們提供專業的手機、平板、電腦維修服務，現場免費檢測，誠實報價。",
                featured_image: "/images/about-img.jpg",
                tags: ["公告", "服務介紹"],
                pinned: true,
                slug: "welcome"
            },
            {
                title: "蘋果手機電池保養小撇步",
                date: "2024-01-20",
                excerpt: "想讓蘋果手機電池更耐用嗎？這些保養小撇步一定要知道！",
                featured_image: "/images/portfolio-img1.jpg",
                tags: ["蘋果手機", "電池保養", "維修知識"],
                pinned: false,
                slug: "apple-phone-battery-tips"
            }
        ];

        // 按日期排序，置頂文章優先
        this.articles.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.date) - new Date(a.date);
        });
    }



    renderArticles() {
        if (!this.container) return;

        if (this.articles.length === 0) {
            this.container.innerHTML = `
                <div class="col-md-12 text-center">
                    <p>目前沒有最新消息</p>
                </div>
            `;
            return;
        }

        const articlesHTML = this.articles.map(article => this.renderArticleCard(article)).join('');
        
        this.container.innerHTML = `
            <div class="row">
                ${articlesHTML}
            </div>
        `;
    }

    renderArticleCard(article) {
        const formattedDate = this.formatDate(article.date);
        const tagsHTML = article.tags ? article.tags.map(tag => 
            `<span class="news-tag">${tag}</span>`
        ).join('') : '';

        const pinnedBadge = article.pinned ? '<span class="pinned-badge">置頂</span>' : '';

        return `
            <div class="col-md-6 col-sm-12 news-article wow fadeInUp" data-wow-delay="0.3s">
                <div class="news-card">
                    ${pinnedBadge}
                    ${article.featured_image ? `
                        <div class="news-image">
                            <img src="${article.featured_image}" alt="${article.title}" class="img-responsive">
                        </div>
                    ` : ''}
                    <div class="news-content">
                        <div class="news-meta">
                            <span class="news-date">${formattedDate}</span>
                            ${tagsHTML}
                        </div>
                        <h3 class="news-title">${article.title}</h3>
                        <p class="news-excerpt">${article.excerpt}</p>
                        <a href="#" class="news-read-more" onclick="newsManager.showArticleModal('${article.slug}')">
                            閱讀更多 <i class="fa fa-arrow-right"></i>
                        </a>
                    </div>
                </div>
            </div>
        `;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    }

    showArticleModal(slug) {
        const article = this.articles.find(a => a.slug === slug);
        if (!article) return;

        // 創建模態框顯示完整文章
        const modal = document.createElement('div');
        modal.className = 'news-modal';
        modal.innerHTML = `
            <div class="news-modal-content">
                <div class="news-modal-header">
                    <h2>${article.title}</h2>
                    <span class="news-modal-close" onclick="this.parentElement.parentElement.parentElement.remove()">&times;</span>
                </div>
                <div class="news-modal-body">
                    <div class="news-meta">
                        <span class="news-date">${this.formatDate(article.date)}</span>
                        ${article.tags ? article.tags.map(tag => `<span class="news-tag">${tag}</span>`).join('') : ''}
                    </div>
                    ${article.featured_image ? `<img src="${article.featured_image}" alt="${article.title}" class="img-responsive" style="margin-bottom: 20px;">` : ''}
                    <div class="news-full-content">
                        ${article.body ? this.markdownToHtml(article.body) : `<p>${article.excerpt}</p>`}
                        <hr>
                        <p><strong>聯絡我們：</strong></p>
                        <p>📞 電話：0970-805-995<br>
                        💬 LINE：@cp10712<br>
                        📍 地址：台中市北屯區昌平路一段107之12號</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // 點擊背景關閉模態框
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    markdownToHtml(markdown) {
        // 簡單的 Markdown 轉 HTML
        return markdown
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
            .replace(/\*(.*)\*/gim, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>')
            .replace(/\n\n/gim, '</p><p>')
            .replace(/\n/gim, '<br>')
            .replace(/^(.*)$/gim, '<p>$1</p>')
            .replace(/<p><\/p>/gim, '')
            .replace(/<p>(<h[1-6]>.*<\/h[1-6]>)<\/p>/gim, '$1');
    }
}

// 初始化新聞管理器
let newsManager;
document.addEventListener('DOMContentLoaded', function() {
    newsManager = new NewsManager();
});
