# API Keys 獲取指南

本指南說明如何獲取 DeviantArt 和 Tumblr 的 API 金鑰,用於藝術平台整合功能。

---

## 🎨 DeviantArt API (OAuth 2.0)

### 步驟 1: 註冊 DeviantArt 帳號
1. 前往 https://www.deviantart.com/
2. 如果沒有帳號,點擊 "Join" 註冊
3. 完成電子郵件驗證

### 步驟 2: 建立應用程式
1. 前往開發者頁面: https://www.deviantart.com/developers/
2. 點擊 **"Register Your Application"** (註冊你的應用程式)
3. 如果是第一次,可能需要同意開發者協議

### 步驟 3: 填寫應用程式資訊
填寫以下資訊:

- **Application Name** (應用程式名稱):
  ```
  Elioverse Discord Bot
  ```

- **Description** (描述):
  ```
  A Discord bot that shares Elio movie fan art and creative content with proper artist attribution.
  ```

- **Application Website** (應用程式網站):
  ```
  https://github.com/yourusername/elio-discord-bot
  ```
  (或填入你的專案網址)

- **Redirect URI** (重定向 URI):
  ```
  http://localhost:8000/callback
  ```
  (對於 OAuth 2.0 Client Credentials flow,這個不太重要,但必須填)

- **Application Type** (應用程式類型):
  - 選擇 **"Web Application"**

### 步驟 4: 獲取憑證
1. 提交申請後,你會看到:
   - **Client ID** (客戶端 ID)
   - **Client Secret** (客戶端密鑰)

2. **重要**: 立即複製並保存 `Client Secret`,它只會顯示一次!

### 步驟 5: 設定環境變數
將獲得的憑證加入到 `ai-service/.env`:

```bash
DEVIANTART_CLIENT_ID=你的_client_id
DEVIANTART_CLIENT_SECRET=你的_client_secret
```

### 測試連接
```bash
cd ai-service
python -c "
import asyncio
from app.services.art.deviantart_client import DeviantArtClient

async def test():
    client = DeviantArtClient('你的_client_id', '你的_client_secret')
    success = await client.authenticate()
    print('✅ 認證成功!' if success else '❌ 認證失敗')
    await client.client.aclose()

asyncio.run(test())
"
```

### 常見問題

**Q: 為什麼我的認證失敗?**
- 確認 Client ID 和 Secret 沒有多餘的空格
- 確認你的應用程式已經通過審核 (通常立即通過)
- 檢查 DeviantArt 服務狀態: https://status.deviantart.com/

**Q: 有速率限制嗎?**
- 是的,免費層級約為 **60 requests/hour**
- 我們的系統有內建快取 (30分鐘) 來降低 API 使用

**Q: 費用是多少?**
- DeviantArt API 是 **免費** 的
- 沒有付費計劃,但有速率限制

---

## 📱 Tumblr API

### 步驟 1: 註冊 Tumblr 帳號
1. 前往 https://www.tumblr.com/
2. 如果沒有帳號,點擊 "Get started" 註冊
3. 完成電子郵件驗證

### 步驟 2: 註冊應用程式
1. 前往應用程式註冊頁面: https://www.tumblr.com/oauth/apps
2. 點擊 **"Register application"** (註冊應用程式)

### 步驟 3: 填寫應用程式資訊
填寫以下資訊:

- **Application Name** (應用程式名稱):
  ```
  Elioverse Bot
  ```

- **Application Website** (應用程式網站):
  ```
  https://github.com/yourusername/elio-discord-bot
  ```

- **Application Description** (應用程式描述):
  ```
  A Discord bot that discovers and shares creative Elio movie content from Tumblr with proper attribution to original artists.
  ```

- **Administrative contact email** (管理員聯絡信箱):
  ```
  your-email@example.com
  ```

- **Default callback URL** (預設回調 URL):
  ```
  http://localhost:8000/callback
  ```
  (我們不需要回調,但必須填)

### 步驟 4: 獲取 API Key
1. 註冊完成後,在應用程式列表中點擊你的應用
2. 你會看到:
   - **OAuth Consumer Key** (這就是你的 API Key!)
   - **OAuth Consumer Secret** (我們用 v2 API,不需要這個)

### 步驟 5: 設定環境變數
將 OAuth Consumer Key 加入到 `ai-service/.env`:

```bash
TUMBLR_API_KEY=你的_oauth_consumer_key
```

**注意**: Tumblr API v2 只需要 API Key (OAuth Consumer Key),不需要 Secret。

### 測試連接
```bash
cd ai-service
python -c "
import asyncio
from app.services.art.tumblr_client import TumblrClient

async def test():
    client = TumblrClient('你的_api_key')
    results = await client.search_by_tag('pixar', max_results=1)
    print(f'✅ 成功! 找到 {len(results)} 個結果' if results else '⚠️  沒有結果')
    await client.client.aclose()

asyncio.run(test())
"
```

### 常見問題

**Q: OAuth Consumer Key 和 Secret 有什麼區別?**
- **Consumer Key**: 用於 API v2 (我們使用的版本),公開的識別碼
- **Consumer Secret**: 用於 OAuth 1.0a 認證流程,我們不需要

**Q: 有速率限制嗎?**
- 是的,約為 **5,000 requests/day** (每日)
- 比 DeviantArt 寬鬆很多
- 我們的系統有內建快取來降低使用

**Q: 費用是多少?**
- Tumblr API 是 **完全免費** 的
- 沒有付費選項

**Q: 為什麼搜尋結果很少?**
- Tumblr 的 tagged endpoint 只返回最近的貼文
- 可能需要使用更通用的標籤 (如 "pixar" 而不是 "elio pixar 2025")
- 我們的系統會搜尋多個關鍵字組合來增加結果

---

## 🔒 安全性最佳實踐

### 1. 永遠不要提交 API Keys 到 Git

確保 `.env` 已在 `.gitignore` 中:

```bash
# 檢查 .gitignore
cat .gitignore | grep ".env"

# 如果沒有,新增它
echo ".env" >> .gitignore
```

### 2. 使用環境變數

✅ **正確做法**:
```bash
# .env 檔案
DEVIANTART_CLIENT_ID=abc123
DEVIANTART_CLIENT_SECRET=xyz789
```

❌ **錯誤做法**:
```python
# 永遠不要寫在程式碼中!
client_id = "abc123"
client_secret = "xyz789"
```

### 3. 定期輪換金鑰

- 每 6 個月更換一次 API keys
- 如果懷疑金鑰洩漏,立即重新生成

### 4. 限制權限

- DeviantArt: 我們只需要 "browse" 權限
- Tumblr: 我們只需要讀取權限,不需要發布權限

---

## 🧪 完整測試

獲取兩個 API keys 後,執行完整測試:

```bash
cd /home/justin/web-projects/elio-discord-bot/ai-service

# 確保已設定環境變數
cat .env | grep -E "DEVIANTART|TUMBLR"

# 執行完整測試套件
python test_art_clients.py
```

預期輸出:
```
============================================================
📊 TEST SUMMARY
============================================================
   deviantart.............................. ✅ PASSED
   tumblr.................................. ✅ PASSED
   relevance_scorer........................ ✅ PASSED
   diversity_ranker........................ ✅ PASSED
   content_discovery....................... ✅ PASSED

   Total: 5/5 tests passed

🎉 All tests PASSED!
============================================================
```

---

## 📞 支援資源

### DeviantArt
- 開發者文件: https://www.deviantart.com/developers/
- API 參考: https://www.deviantart.com/developers/http/v1/20210526
- 狀態頁面: https://status.deviantart.com/
- 支援論壇: https://www.deviantart.com/developers/forum

### Tumblr
- 開發者文件: https://www.tumblr.com/docs/en/api/v2
- API 控制台: https://api.tumblr.com/console
- 支援: https://www.tumblr.com/support

### 問題排查
如果遇到問題,請檢查:
1. API key 是否正確複製 (沒有多餘空格)
2. 網路連接是否正常
3. 服務狀態是否正常
4. Python 版本 >= 3.8
5. 已安裝依賴: `pip install httpx python-dotenv`

---

## ✅ 快速設定檢查清單

- [ ] 註冊 DeviantArt 開發者帳號
- [ ] 建立 DeviantArt 應用程式
- [ ] 複製 DeviantArt Client ID 和 Secret
- [ ] 註冊 Tumblr 開發者帳號
- [ ] 建立 Tumblr 應用程式
- [ ] 複製 Tumblr API Key
- [ ] 將所有 keys 加入 `ai-service/.env`
- [ ] 確認 `.env` 在 `.gitignore` 中
- [ ] 執行 `python test_art_clients.py` 測試
- [ ] 確認所有 5 個測試都通過 ✅

---

**需要協助?** 檢查測試輸出的錯誤訊息,或參考上方的常見問題解答。
