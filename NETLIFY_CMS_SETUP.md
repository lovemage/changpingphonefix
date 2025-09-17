# Netlify CMS 部署說明

## 📋 概述
此專案已整合 Netlify CMS，讓您可以透過網頁界面輕鬆管理網站內容，包括發布最新消息、修改聯絡資訊等。

## 🚀 部署步驟

### 1. 準備 Git Repository
```bash
# 初始化 Git repository
git init

# 添加所有文件
git add .

# 提交初始版本
git commit -m "初始化昌平手機維修網站"

# 連接到 GitHub (請先在 GitHub 創建 repository)
git remote add origin https://github.com/你的用戶名/昌平手機維修.git
git branch -M main
git push -u origin main
```

### 2. 部署到 Netlify
1. 登入 [Netlify](https://www.netlify.com/)
2. 點擊 "New site from Git"
3. 選擇 GitHub 並授權
4. 選擇您的 repository
5. 部署設定：
   - Build command: 留空 (靜態網站)
   - Publish directory: `/` (根目錄)
6. 點擊 "Deploy site"

### 3. 啟用 Netlify Identity
1. 在 Netlify 控制台中，進入您的網站
2. 點擊 "Identity" 標籤
3. 點擊 "Enable Identity"
4. 在 "Registration preferences" 中選擇 "Invite only"
5. 在 "External providers" 中可以啟用 Google/GitHub 登入

### 4. 啟用 Git Gateway
1. 在 Identity 設定中，點擊 "Services" 標籤
2. 點擊 "Git Gateway" 的 "Enable"

### 5. 邀請管理員
1. 在 Identity 標籤中，點擊 "Invite users"
2. 輸入您的 email 地址
3. 檢查 email 並設定密碼

## 🎯 使用 CMS

### 訪問管理界面
部署完成後，訪問 `https://您的網站.netlify.app/admin` 來管理內容。

### 功能說明

#### 📰 最新消息管理
- **新增文章**：點擊 "最新消息" → "New 最新消息"
- **編輯文章**：在列表中點擊要編輯的文章
- **文章設定**：
  - 標題：文章標題
  - 發布日期：自動設定或手動選擇
  - 摘要：在文章列表中顯示的簡短描述
  - 特色圖片：文章的主要圖片
  - 內容：使用 Markdown 格式編寫
  - 標籤：用於分類文章
  - 是否置頂：置頂文章會顯示在最前面
  - 發布狀態：控制文章是否公開顯示

#### 🏠 頁面管理
- **首頁設定**：修改網站標題、標語等
- **聯絡資訊**：更新地址、電話、營業時間等

## 📝 Markdown 語法參考

```markdown
# 大標題
## 中標題
### 小標題

**粗體文字**
*斜體文字*

- 項目1
- 項目2
- 項目3

1. 編號項目1
2. 編號項目2

[連結文字](https://example.com)

![圖片描述](圖片網址)
```

## 🔧 本地開發

如果需要在本地測試 CMS：

1. 安裝 Netlify CLI：
```bash
npm install -g netlify-cli
```

2. 在專案目錄中啟動本地服務：
```bash
netlify dev
```

3. 訪問 `http://localhost:8888/admin` 來測試 CMS

## 📱 自動化工作流程

當您在 CMS 中發布新文章時：
1. 內容會自動提交到 Git repository
2. Netlify 會自動重新部署網站
3. 新內容會立即在網站上顯示

## 🆘 常見問題

### Q: 無法登入 CMS
A: 確認已啟用 Netlify Identity 並邀請了用戶

### Q: 文章沒有顯示
A: 檢查文章的 "發布狀態" 是否設為 true

### Q: 圖片無法上傳
A: 確認 Git Gateway 已啟用且有寫入權限

## 📞 技術支援
如有任何問題，請聯絡：
- 電話：0970-805-995
- LINE：@cp10712
