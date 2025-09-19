// 網站配置管理
class SiteConfigManager {
    constructor() {
        this.config = null;
        this.init();
    }

    async init() {
        await this.loadConfig();
        this.updateHomepageImages();
        // 維修案例已移至獨立頁面，首頁不需要更新
    }

    async loadConfig() {
        try {
            const response = await fetch('/site-config.json');
            if (response.ok) {
                this.config = await response.json();
                console.log('Site config loaded:', this.config);
            } else {
                console.warn('Could not load site config, using defaults');
                this.useDefaultConfig();
            }
        } catch (error) {
            console.warn('Error loading site config:', error);
            this.useDefaultConfig();
        }
    }

    useDefaultConfig() {
        this.config = {
            homepage: {
                hero_background_1: "/images/home-bg-slideshow1.jpg",
                hero_background_2: "/images/home-bg-slideshow2.jpg",
                about_image: "/images/about-img.jpg"
            },
            portfolio: {
                cases: [
                    {title: "蘋果手機螢幕維修案例", image: "/images/iphone.jpg", category: "iphone", alt: "蘋果手機螢幕維修案例"},
                    {title: "蘋果手機電池更換", image: "/images/iphone2.jpg", category: "iphone", alt: "蘋果手機電池更換"},
                    {title: "蘋果手機主機板維修", image: "/images/iphone3.jpg", category: "iphone", alt: "蘋果手機主機板維修"},
                    {title: "蘋果手機充電孔維修", image: "/images/iphone4.jpg", category: "iphone", alt: "蘋果手機充電孔維修"},
                    {title: "Android手機維修", image: "/images/android.jpg", category: "android", alt: "Android手機維修"},
                    {title: "Android螢幕更換", image: "/images/an1.jpg", category: "android", alt: "Android螢幕更換"},
                    {title: "Android電池維修", image: "/images/an2.jpg", category: "android", alt: "Android電池維修"},
                    {title: "Android系統修復", image: "/images/an3.jpg", category: "android", alt: "Android系統修復"},
                    {title: "平板螢幕維修", image: "/images/pad1.jpg", category: "tablet", alt: "平板螢幕維修"},
                    {title: "平板充電維修", image: "/images/pad2.jpg", category: "tablet", alt: "平板充電維修"}
                ]
            }
        };
    }

    updateHomepageImages() {
        if (!this.config || !this.config.homepage) return;

        // 更新首頁背景圖片
        const backgrounds = [
            this.config.homepage.hero_background_1 || "/images/home-bg-slideshow1.jpg",
            this.config.homepage.hero_background_2 || "/images/home-bg-slideshow2.jpg"
        ];

        // 等待 jQuery 和 backstretch 載入
        if (typeof jQuery !== 'undefined' && jQuery.fn.backstretch) {
            jQuery('#home').backstretch(backgrounds, {duration: 2000, fade: 750});
        } else {
            // 如果 jQuery 還沒載入，等待一下再試
            setTimeout(() => {
                if (typeof jQuery !== 'undefined' && jQuery.fn.backstretch) {
                    jQuery('#home').backstretch(backgrounds, {duration: 2000, fade: 750});
                }
            }, 1000);
        }

        // 更新關於我們圖片
        const aboutImg = document.querySelector('#about img[src*="about-img"]');
        if (aboutImg && this.config.homepage.about_image) {
            aboutImg.src = this.config.homepage.about_image;
        }
    }

    updatePortfolioImages() {
        if (!this.config || !this.config.portfolio || !this.config.portfolio.cases) return;

        const portfolioContainer = document.querySelector('.iso-box-wrapper');
        if (!portfolioContainer) return;

        // 清空現有內容
        portfolioContainer.innerHTML = '';

        // 生成新的維修案例
        this.config.portfolio.cases.forEach(caseItem => {
            const caseElement = document.createElement('div');
            caseElement.className = `iso-box ${caseItem.category} col-lg-4 col-md-4 col-sm-6`;
            caseElement.innerHTML = `
                <a href="${caseItem.image}" data-lightbox-gallery="portfolio-gallery">
                    <img src="${caseItem.image}" alt="${caseItem.alt}">
                </a>
            `;
            portfolioContainer.appendChild(caseElement);
        });

        // 重新初始化 isotope 和 lightbox
        this.reinitializePortfolio();
    }

    reinitializePortfolio() {
        // 等待圖片載入完成後重新初始化 isotope
        if (typeof jQuery !== 'undefined') {
            jQuery(document).ready(() => {
                const $container = jQuery('.iso-box-wrapper');
                
                // 重新初始化 isotope
                if (jQuery.fn.isotope) {
                    $container.imagesLoaded(() => {
                        $container.isotope({
                            itemSelector: '.iso-box',
                            layoutMode: 'fitRows'
                        });
                    });
                }

                // 重新初始化 lightbox
                if (jQuery.fn.nivoLightbox) {
                    jQuery('.iso-box-section a').nivoLightbox({
                        effect: 'fadeScale',
                    });
                }
            });
        }
    }
}

// 初始化網站配置管理器
let siteConfigManager;
document.addEventListener('DOMContentLoaded', function() {
    siteConfigManager = new SiteConfigManager();
});
