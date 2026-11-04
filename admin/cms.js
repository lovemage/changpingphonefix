/*
 * 昌平手機維修 CMS 擴充
 * 1. htmleditor：富文本（Jodit）與 HTML 原始碼可切換的內容編輯器，支援從媒體庫插入圖片
 * 2. 最新消息預覽：與前台相同的文章版型 + SEO 檢查（Google 搜尋結果、社群分享、檢查清單）
 */
(function () {
  'use strict';

  var CMS = window.CMS;
  var h = window.h || (window.React && window.React.createElement);
  var createClass = window.createClass;
  var AR = window.ArticleRender;
  var Jodit = window.Jodit;

  if (!CMS || !h || !createClass || !AR) {
    console.error('[cms] Decap CMS 或文章模組未正確載入');
    return;
  }

  var MODE_KEY = 'cpfix-editor-mode';
  var idCounter = 0;

  function readMode() {
    try { return window.localStorage.getItem(MODE_KEY) === 'code' ? 'code' : 'rich'; } catch (e) { return 'rich'; }
  }

  function saveMode(mode) {
    try { window.localStorage.setItem(MODE_KEY, mode); } catch (e) { /* 忽略 */ }
  }

  // Jodit 在空白內容時會輸出 <p><br></p>，視為空字串，讓「必填」檢查正常運作
  function normalizeHtml(html) {
    var value = String(html || '');
    if (!AR.stripHtml(value) && !/<(img|iframe|video|hr|table)\b/i.test(value)) return '';
    return value;
  }

  // 將區塊元素分行，方便在原始碼模式閱讀（不改變顯示結果）
  function tidyHtml(html) {
    var blocks = 'p|h[1-6]|ul|ol|li|table|thead|tbody|tfoot|tr|blockquote|figure|figcaption|div|pre|hr|section|iframe';
    return String(html || '')
      .replace(new RegExp('\\s*(<(?:' + blocks + ')\\b[^>]*>)', 'gi'), '\n$1')
      .replace(new RegExp('(</(?:' + blocks + ')>)\\s*', 'gi'), '$1\n')
      .replace(/(<hr\b[^>]*>)\s*/gi, '$1\n')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function escapeAttr(text) {
    return AR.escapeHtml(text);
  }

  function toPaths(mediaPath) {
    if (!mediaPath) return [];
    if (typeof mediaPath.toJS === 'function') mediaPath = mediaPath.toJS();
    return Array.isArray(mediaPath) ? mediaPath : [mediaPath];
  }

  /* =========================================================
   * 1. 內容編輯器 widget
   * ========================================================= */
  var HtmlEditorControl = createClass({
    getInitialState: function () {
      return { mode: Jodit ? readMode() : 'code' };
    },

    // Decap 外層 Widget 預設只在 value 改變時重繪；媒體庫選圖會更新 mediaPaths，需一併納入判斷
    shouldComponentUpdate: function (nextProps, nextState) {
      if (nextState && nextState.mode !== this.state.mode) return true;
      var id = this.mediaControlId;
      var prevPicked = this.props.mediaPaths && this.props.mediaPaths.get && this.props.mediaPaths.get(id);
      var nextPicked = nextProps.mediaPaths && nextProps.mediaPaths.get && nextProps.mediaPaths.get(id);
      return prevPicked !== nextPicked ||
        this.props.value !== nextProps.value ||
        this.props.classNameWrapper !== nextProps.classNameWrapper ||
        this.props.hasActiveStyle !== nextProps.hasActiveStyle;
    },

    componentDidMount: function () {
      idCounter += 1;
      this.mediaControlId = 'htmleditor-media-' + idCounter + '-' + Date.now();
      if (this.state.mode === 'rich') this.mountRich();
    },

    componentWillUnmount: function () {
      this.destroyRich();
      if (this.props.onRemoveMediaControl) this.props.onRemoveMediaControl(this.mediaControlId);
    },

    componentDidUpdate: function (prevProps, prevState) {
      // 媒體庫選好圖片後插入
      var mediaPaths = this.props.mediaPaths;
      var picked = mediaPaths && mediaPaths.get && mediaPaths.get(this.mediaControlId);
      if (picked && picked !== this.lastPicked) {
        this.lastPicked = picked;
        this.insertImages(toPaths(picked));
        if (this.props.onRemoveInsertedMedia) this.props.onRemoveInsertedMedia(this.mediaControlId);
      } else if (!picked) {
        this.lastPicked = null;
      }

      // 模式切換
      if (prevState.mode !== this.state.mode) {
        if (this.state.mode === 'rich') this.mountRich();
        else this.destroyRich();
      }

      // 外部變更（例如還原草稿）同步到編輯器
      if (this.editor && this.props.value !== prevProps.value) {
        var next = this.props.value || '';
        if (next !== this.lastEmitted && next !== this.editor.value) {
          this.setEditorValue(next);
        }
      }
    },

    emit: function (html) {
      var value = normalizeHtml(html);
      this.lastEmitted = value;
      this.props.onChange(value);
    },

    mountRich: function () {
      if (!Jodit || this.editor || !this.richHost) return;
      var self = this;
      var paragraphList = {
        p: '內文',
        h2: '標題 2（段落大標）',
        h3: '標題 3（小標）',
        h4: '標題 4',
        blockquote: '引言',
        pre: '程式碼'
      };

      this.editor = Jodit.make(this.richHost, {
        language: 'zh_tw',
        minHeight: 420,
        height: 560,
        toolbarAdaptive: false,
        // Decap 編輯區是獨立捲動容器，黏性工具列會蓋住上方的模式切換按鈕
        toolbarSticky: false,
        statusbar: true,
        showCharsCounter: true,
        showWordsCounter: false,
        showXPathInStatusbar: false,
        askBeforePasteHTML: false,
        askBeforePasteFromWord: false,
        defaultActionOnPaste: 'insert_clear_html',
        enter: 'p',
        uploader: { insertImageAsBase64URI: false },
        link: { noFollowCheckbox: true, openInNewTabCheckbox: true },
        buttons: [
          'paragraph', '|',
          'bold', 'italic', 'underline', 'strikethrough', '|',
          'ul', 'ol', 'indent', 'outdent', '|',
          'link', 'table', 'video', 'hr', '|',
          'align', '|',
          'eraser', 'undo', 'redo', '|',
          'fullsize'
        ],
        controls: {
          paragraph: { list: Jodit.atom ? Jodit.atom(paragraphList) : paragraphList }
        }
      });

      this.setEditorValue(this.props.value || '');
      var events = this.editor.e || this.editor.events;
      events.on('change', function (html) {
        // 程式設定內容後，Jodit 會正規化 HTML 並觸發 change；這段期間不回寫，避免誤判為「有未儲存變更」
        if (Date.now() < self.ignoreChangeUntil) return;
        if (normalizeHtml(html) === self.lastEmitted) return;
        self.emit(html);
      });
      events.on('focus', function () { if (self.props.setActiveStyle) self.props.setActiveStyle(); });
      events.on('blur', function () { if (self.props.setInactiveStyle) self.props.setInactiveStyle(); });
    },

    setEditorValue: function (html) {
      this.ignoreChangeUntil = Date.now() + 500;
      this.lastEmitted = normalizeHtml(html);
      this.editor.value = html;
    },

    destroyRich: function () {
      if (this.editor) {
        try { this.editor.destruct(); } catch (e) { /* 忽略 */ }
        this.editor = null;
      }
    },

    setMode: function (mode) {
      if (mode === this.state.mode) return;
      if (mode === 'rich' && !Jodit) return;
      if (this.editor) this.emit(this.editor.value);
      saveMode(mode);
      this.setState({ mode: mode });
    },

    openMediaLibrary: function (e) {
      e.preventDefault();
      if (!this.props.onOpenMediaLibrary) return;
      if (this.editor && this.editor.s) {
        try { this.editor.s.save(); } catch (err) { /* 忽略 */ }
      }
      if (this.textarea) {
        this.codeSelection = { start: this.textarea.selectionStart, end: this.textarea.selectionEnd };
      }
      this.props.onOpenMediaLibrary({
        controlID: this.mediaControlId,
        forImage: true,
        privateUpload: false,
        value: '',
        allowMultiple: false,
        field: this.props.field
      });
    },

    insertImages: function (paths) {
      if (!paths.length) return;
      var html = paths.map(function (src) {
        var alt = window.prompt('請輸入圖片說明（替代文字 alt，有助 SEO 與無障礙）：', '') || '';
        return '<p><img src="' + escapeAttr(src) + '" alt="' + escapeAttr(alt.trim()) + '"></p>';
      }).join('');

      if (this.state.mode === 'rich' && this.editor) {
        try { this.editor.s.restore(); } catch (err) { /* 忽略 */ }
        this.editor.s.insertHTML(html);
        this.emit(this.editor.value);
        return;
      }

      var value = this.props.value || '';
      var sel = this.codeSelection || { start: value.length, end: value.length };
      this.emit(value.slice(0, sel.start) + '\n' + html + '\n' + value.slice(sel.end));
    },

    handleCodeChange: function (e) {
      this.emit(e.target.value);
    },

    handleCodeKeyDown: function (e) {
      // Tab 鍵插入兩個空白，而不是跳到下一個欄位
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        var el = e.target;
        var start = el.selectionStart;
        var end = el.selectionEnd;
        var value = el.value;
        this.emit(value.slice(0, start) + '  ' + value.slice(end));
        var self = this;
        window.requestAnimationFrame(function () {
          if (self.textarea) self.textarea.selectionStart = self.textarea.selectionEnd = start + 2;
        });
      }
    },

    tidy: function (e) {
      e.preventDefault();
      this.emit(tidyHtml(this.props.value));
    },

    render: function () {
      var self = this;
      var mode = this.state.mode;
      var value = this.props.value || '';

      function tab(id, label) {
        var active = mode === id;
        return h('button', {
          type: 'button',
          className: 'cpfix-mode-btn' + (active ? ' is-active' : ''),
          'aria-pressed': active ? 'true' : 'false',
          disabled: id === 'rich' && !Jodit,
          onClick: function () { self.setMode(id); }
        }, label);
      }

      return h('div', { className: 'cpfix-editor ' + (this.props.classNameWrapper || ''), id: this.props.forID },
        h('div', { className: 'cpfix-editor-bar' },
          h('div', { className: 'cpfix-mode', role: 'group', 'aria-label': '編輯模式' },
            tab('rich', '富文本編輯'),
            tab('code', 'HTML 原始碼')
          ),
          h('div', { className: 'cpfix-editor-actions' },
            mode === 'code' ? h('button', { type: 'button', className: 'cpfix-action-btn', onClick: this.tidy }, '整理排版') : null,
            h('button', { type: 'button', className: 'cpfix-action-btn', onClick: this.openMediaLibrary }, '插入圖片（媒體庫）')
          )
        ),
        mode === 'rich'
          ? h('div', { className: 'cpfix-rich' }, h('textarea', { ref: function (el) { self.richHost = el; } }))
          : h('div', { className: 'cpfix-code' },
              h('textarea', {
                ref: function (el) { self.textarea = el; },
                className: 'cpfix-code-input',
                value: value,
                spellCheck: false,
                onChange: this.handleCodeChange,
                onKeyDown: this.handleCodeKeyDown,
                onFocus: this.props.setActiveStyle,
                onBlur: this.props.setInactiveStyle,
                placeholder: '<h2>段落標題</h2>\n<p>內文…</p>'
              }),
              h('p', { className: 'cpfix-code-note' },
                '可直接貼上 HTML（例如 YouTube 內嵌碼、表格）。切回「富文本編輯」時，編輯器可能會調整部分語法；<script> 會被移除。')
            )
      );
    }
  });

  var HtmlEditorPreview = createClass({
    render: function () {
      return h('div', { dangerouslySetInnerHTML: { __html: this.props.value || '' } });
    }
  });

  CMS.registerWidget('htmleditor', HtmlEditorControl, HtmlEditorPreview);

  /* =========================================================
   * 2. 最新消息預覽
   * ========================================================= */
  function toPlain(value) {
    if (value && typeof value.toJS === 'function') return value.toJS();
    return value;
  }

  function entryToPost(entry) {
    // 切換頁面或剛發布時，entry 可能暫時是空的
    var data = entry && entry.get && entry.get('data');
    if (!data || !data.get) return null;
    var get = function (key) { return toPlain(data.get(key)); };
    return {
      title: get('title') || '',
      slug: get('slug') || '',
      date: get('date') || new Date().toISOString(),
      updated: get('updated') || '',
      excerpt: get('excerpt') || '',
      featured_image: get('featured_image') || '',
      featured_image_alt: get('featured_image_alt') || '',
      tags: AR.normalizeTags(get('tags')),
      category: get('category') || '',
      seo_title: get('seo_title') || '',
      seo_description: get('seo_description') || '',
      noindex: get('noindex') === true,
      pinned: get('pinned') === true,
      bodyHtml: get('body') || ''
    };
  }

  // 分類名稱對照（由 build 產生 /news/categories.json；剛新增、尚未上線的分類會先顯示網址代稱）
  var categoryNames = null;
  var categoryWaiters = [];
  function loadCategoryNames(cb) {
    if (categoryNames) return cb(categoryNames);
    categoryWaiters.push(cb);
    if (categoryWaiters.length > 1) return;
    fetch('/news/categories.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (list) {
        categoryNames = {};
        (list || []).forEach(function (c) { categoryNames[c.slug] = c.name; });
        categoryWaiters.splice(0).forEach(function (fn) { fn(categoryNames); });
      });
  }

  var NewsPreview = createClass({
    getInitialState: function () {
      return { seoOpen: true, categoryNames: categoryNames || {} };
    },

    componentDidMount: function () {
      var self = this;
      this.mounted = true;
      loadCategoryNames(function (names) { if (self.mounted) self.setState({ categoryNames: names }); });
    },

    componentWillUnmount: function () {
      this.mounted = false;
    },

    resolveAsset: function (path) {
      if (!path) return '';
      try {
        var asset = this.props.getAsset(path);
        var url = asset && asset.toString();
        return url || path;
      } catch (e) {
        return path;
      }
    },

    render: function () {
      var self = this;
      var post = entryToPost(this.props.entry);
      if (!post) return null;
      if (post.category) post.categoryName = this.state.categoryNames[post.category] || post.category;
      var meta = AR.buildMeta(post);
      var audit = AR.seoAudit(post);

      // 內文中剛上傳、尚未發佈的圖片改用暫存網址顯示
      var previewPost = Object.assign({}, post, {
        bodyHtml: post.bodyHtml.replace(/(<img\b[^>]*\bsrc=")(\/images\/[^"]+)(")/gi, function (m, a, src, b) {
          return a + self.resolveAsset(src) + b;
        })
      });

      var articleHtml = AR.renderArticleMain(previewPost, {
        resolveAsset: function (p) { return self.resolveAsset(p); }
      });

      var counts = { error: 0, warn: 0, ok: 0 };
      audit.forEach(function (r) { counts[r.level] += 1; });

      var googleTitle = AR.truncateByWidth(meta.fullTitle, 64);
      var googleDesc = AR.truncateByWidth(meta.description, 240);
      var urlPath = 'cp-phonefix.com › news › ' + (post.slug || '網址代稱');
      var coverUrl = this.resolveAsset(post.featured_image || AR.SITE.defaultImage);

      var statusLabel = counts.error ? counts.error + ' 項需修正' : counts.warn ? counts.warn + ' 項建議' : '全部通過';

      return h('div', { className: 'cpfix-preview' },
        h('section', { className: 'cpfix-seo' + (this.state.seoOpen ? '' : ' is-collapsed') },
          h('button', {
            type: 'button',
            className: 'cpfix-seo-toggle',
            onClick: function () { self.setState({ seoOpen: !self.state.seoOpen }); }
          },
            h('span', { className: 'cpfix-seo-heading' }, 'SEO 檢查'),
            h('span', { className: 'cpfix-seo-status ' + (counts.error ? 'is-error' : counts.warn ? 'is-warn' : 'is-ok') }, statusLabel),
            h('span', { className: 'cpfix-seo-caret' }, this.state.seoOpen ? '收合' : '展開')
          ),
          this.state.seoOpen ? h('div', { className: 'cpfix-seo-body' },
            h('div', { className: 'cpfix-seo-cols' },
              h('div', { className: 'cpfix-seo-col' },
                h('p', { className: 'cpfix-seo-label' }, 'Google 搜尋結果預覽'),
                h('div', { className: 'cpfix-serp' },
                  h('div', { className: 'cpfix-serp-site' },
                    h('img', { src: '/images/logo300.png', alt: '', width: 26, height: 26 }),
                    h('div', null,
                      h('div', { className: 'cpfix-serp-name' }, AR.SITE.name),
                      h('div', { className: 'cpfix-serp-url' }, urlPath)
                    )
                  ),
                  h('div', { className: 'cpfix-serp-title' }, googleTitle || '（尚未輸入標題）'),
                  h('div', { className: 'cpfix-serp-desc' }, googleDesc || '（尚未輸入摘要）')
                ),
                h('p', { className: 'cpfix-seo-label' }, 'Facebook / LINE 分享預覽'),
                h('div', { className: 'cpfix-social' },
                  h('div', { className: 'cpfix-social-img', style: { backgroundImage: 'url("' + coverUrl + '")' } }),
                  h('div', { className: 'cpfix-social-text' },
                    h('div', { className: 'cpfix-social-domain' }, 'CP-PHONEFIX.COM'),
                    h('div', { className: 'cpfix-social-title' }, meta.seoTitle || '（尚未輸入標題）'),
                    h('div', { className: 'cpfix-social-desc' }, AR.truncateByWidth(meta.description, 120))
                  )
                )
              ),
              h('div', { className: 'cpfix-seo-col' },
                h('p', { className: 'cpfix-seo-label' }, '檢查清單'),
                h('ul', { className: 'cpfix-checklist' }, audit.map(function (r, i) {
                  var icon = r.level === 'ok' ? '✓' : r.level === 'warn' ? '!' : '✕';
                  return h('li', { key: i, className: 'is-' + r.level },
                    h('span', { className: 'cpfix-check-icon', 'aria-hidden': 'true' }, icon),
                    h('span', null, r.msg)
                  );
                }))
              )
            )
          ) : null
        ),
        h('div', { className: 'page-news cpfix-page' },
          h('main', { className: 'news-page' },
            h('div', { className: 'container', dangerouslySetInnerHTML: { __html: articleHtml } })
          )
        )
      );
    }
  });

  CMS.registerPreviewTemplate('news', NewsPreview);

  /* =========================================================
   * 3. 維修案例預覽（與前台 portfolio.html 同一套卡片）
   * ========================================================= */
  var PortfolioPreview = createClass({
    resolveAsset: function (path) {
      if (!path) return '';
      try {
        var asset = this.props.getAsset(path);
        return (asset && asset.toString()) || path;
      } catch (e) {
        return path;
      }
    },

    render: function () {
      var self = this;
      var entry = this.props.entry;
      var cases = (entry && entry.getIn ? toPlain(entry.getIn(['data', 'cases'])) : null) || [];
      var html = cases.map(function (item, i) {
        item = item || {};
        var body = String(item.body || '').replace(/(<img\b[^>]*\bsrc=")(\/images\/[^"]+)(")/gi, function (m, a, src, b) {
          return a + self.resolveAsset(src) + b;
        });
        return AR.renderCaseCard(Object.assign({}, item, { body: body }), {
          index: i,
          expanded: true,
          resolveAsset: function (p) { return self.resolveAsset(p); }
        });
      }).join('');

      return h('div', { className: 'cpfix-preview cpfix-cases' },
        h('p', { className: 'cpfix-cases-note' }, '前台的長文案會先顯示約 6 行，訪客點「展開全文」才看到全部；這裡直接顯示完整內容方便檢查。'),
        h('div', { className: 'cpfix-cases-grid', dangerouslySetInnerHTML: { __html: html || '<p class="case-empty">尚未新增案例。</p>' } })
      );
    }
  });

  CMS.registerPreviewTemplate('portfolio', PortfolioPreview);

  /* =========================================================
   * 4. 單一頁面設定（首頁設定／聯絡資訊／維修案例）
   *    導航點下去直接進入編輯畫面，不必再點一次清單
   * ========================================================= */
  var SINGLE_FILE = { categories: 'categories', homepage: 'homepage', contact: 'contact', portfolio: 'portfolio' };

  function entryHashFor(name) {
    return '#/collections/' + name + '/entries/' + SINGLE_FILE[name];
  }

  function singleFileTarget(name) {
    // 已在該頁編輯畫面（例如按左上角「←」）→ 回最新消息；否則直接開編輯畫面
    return window.location.hash.indexOf(entryHashFor(name)) === 0 ? '#/collections/news' : entryHashFor(name);
  }

  // 在點擊當下就改目的地，不經過清單頁。
  // 若先進清單頁再跳轉，會跟 Decap 載入清單的時機衝突，偶爾跳出「無法預覽內容」錯誤。
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link) return;
    var m = (link.getAttribute('href') || '').match(/^#?\/collections\/([^/?#]+)\/?$/);
    if (!m || !SINGLE_FILE[m[1]]) return;
    e.preventDefault();
    e.stopPropagation();
    window.location.hash = singleFileTarget(m[1]);
  }, true);

  // 直接輸入或從書籤開啟清單網址時的備援（頁面載入當下、Decap 尚未渲染前處理）
  function openSingleFileEntry() {
    var m = window.location.hash.match(/^#\/collections\/([^/?]+)\/?(\?.*)?$/);
    if (m && SINGLE_FILE[m[1]]) window.location.replace(entryHashFor(m[1]));
  }

  window.addEventListener('hashchange', openSingleFileEntry);
  openSingleFileEntry();
  CMS.registerPreviewStyle('/css/bootstrap.min.css');
  CMS.registerPreviewStyle('/css/font-awesome.min.css');
  CMS.registerPreviewStyle('/css/style.css');
  CMS.registerPreviewStyle('/css/article.css');
  CMS.registerPreviewStyle('/css/portfolio.css');
  CMS.registerPreviewStyle('/admin/preview.css');
})();
