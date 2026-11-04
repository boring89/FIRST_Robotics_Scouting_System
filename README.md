# FIRST Robotics Scouting System

以網頁為基底的 FRC 偵察（Scouting）工具，純靜態網站，可直接部署在 GitHub Pages。

## 功能

- **隊伍資訊**：隊號、隊名、地區、賽季、賽事代碼、觀察場次、Scout 人員、日期
- **Statbotics 整合**：輸入隊號一鍵抓取 EPA（總分 / 自動 / 手動 / 終局）、世界 / 國家 / 地區排名、戰績、各賽事表現及本季遊戲項目細項
- **機構照片**：可多張上傳或手機直接拍照，自動壓縮，可加說明與排序
- **機構參數**：底盤、馬達、尺寸、重量、速度、程式語言、視覺系統等，並可新增自訂參數
- **機構與效率**：每個機構的類型、馬達、週期時間、成功率、評分
- **效率**：平均得分、週期、命中率、終局成功率、故障次數，1–5 分評分；自動比較 Scout 預估得分與 Statbotics EPA
- **逐場紀錄**：比賽中用全螢幕大按鈕 +/- 記錄自動 / 手動得分與未命中、離開起始區、終局結果、防守、犯規、故障。自動算出平均、命中率、終局成功率，一鍵套用到效率欄位。可在「計分設定」填入當季每次動作的分數，換算成平均得分
- **策略**：角色定位、起始位置、自動 / 手動 / 終局策略、優劣勢、聯盟搭配、選隊建議
- **輸出 PDF**：A4 報告包含以上所有資訊與照片，首頁附 QR Code（PDF 中也可點擊）
- **QR Code**：內含該筆紀錄的文字資料（不含照片），掃描後開啟網站即自動匯入，方便 Scout 之間交換資料
- **選隊清單**：比較所有隊伍的 EPA、Scout 預估、逐場數據、評分與選隊建議，可依各項排序或用 ↑↓ 排出自己的順序；選隊時標記「已選走」；一鍵更新全部隊伍的 Statbotics；匯出選隊 PDF
- **多人合併**：掃描別人的 QR Code 時，若已有同隊同賽事的紀錄，可選擇合併（逐場紀錄自動去除重複、空白欄位補上）
- **多筆紀錄**：資料存在瀏覽器 IndexedDB，可切換、新增、刪除；可匯出 / 匯入 JSON（含照片）
- **離線可用**：部署在 HTTPS（GitHub Pages）時會註冊 Service Worker，比賽場館網路不穩也能使用（Statbotics 抓取需要網路）

## 部署到 GitHub Pages

專案已附 `.github/workflows/pages.yml`，推送到 `main` 時會自動部署：

1. 將專案推送到 GitHub。
2. 到 repository 的 **Settings → Pages**，**Source** 選擇 **GitHub Actions**。
3. 推送到 `main`（或在 Actions 頁面手動執行 *Deploy to GitHub Pages*）。
4. 網址為 `https://<帳號>.github.io/<repository 名稱>/`。

所有路徑皆為相對路徑，放在子目錄也能正常運作。若想改用 **Deploy from a branch**，選 `main` 的 `/ (root)` 即可（已附 `.nojekyll`）。

> QR Code 中的連結會指向產生它的網址，所以請在部署後的 GitHub Pages 網站上產生 PDF，別人掃描才能開啟。

## 本機執行

不需要建置步驟，任何靜態伺服器都可以：

```bash
python3 -m http.server 8000
```

然後開啟 <http://localhost:8000>。（直接用 `file://` 開啟會因 ES module 限制而無法運作。）

## 專案結構

```
index.html           主頁面
css/style.css        介面樣式（支援深色模式）
css/report.css       PDF 報告樣式
js/app.js            表單、紀錄管理、事件處理
js/model.js          資料結構與欄位定義（要增減欄位改這裡）
js/storage.js        IndexedDB 儲存
js/statbotics.js     Statbotics v3 API
js/report.js         QR Code 與 PDF 產生
js/matches.js        逐場紀錄輸入視窗
js/picklist.js       選隊清單
sw.js                離線快取
vendor/              jsPDF、html2canvas、qrcode-generator、lz-string（已內含，不依賴 CDN）
```

每年遊戲不同時，可在 `js/model.js` 調整欄位，或直接在網頁上使用「自訂參數」。Statbotics 的遊戲項目細項會自動依賽季顯示。

## 使用的套件

- [jsPDF](https://github.com/parallax/jsPDF) 2.5.1、[html2canvas](https://github.com/niklasvh/html2canvas) 1.4.1：產生 PDF（以圖片方式繪製頁面，中文不需額外字型）
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4：QR Code
- [lz-string](https://github.com/pieroxy/lz-string) 1.5.0：壓縮 QR Code 內的資料
- 數據來源：[Statbotics](https://www.statbotics.io)
