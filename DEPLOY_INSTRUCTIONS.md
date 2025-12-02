# 部署指南 - Elio Discord Bot

## 目前完成的工作

### 已完成
- [x] 所有程式碼變更已提交到本地 Git (`7685a66`)
- [x] 測試全部通過 (E2E: 28/28, Integration: 20/20)
- [x] Slash commands 已部署到開發伺服器
- [x] GitHub Actions workflows 已建立

### 待完成 (需要手動操作)
- [ ] 推送到 GitHub
- [ ] 連線到遠端伺服器 (live.dothost.net)
- [ ] 在遠端伺服器部署

---

## 步驟 1: 推送到 GitHub

### 選項 A: 使用 Personal Access Token (推薦)

1. 前往 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 生成新 token，勾選 `repo` 權限
3. 執行：

```bash
# 設定 remote URL (使用 token)
git remote set-url origin https://YOUR_TOKEN@github.com/Justin21523/elio-discord-bot.git

# 推送
git push origin main
```

### 選項 B: 使用 SSH Key

1. 生成 SSH key (如果沒有):
```bash
ssh-keygen -t ed25519 -C "your-email@example.com"
```

2. 複製公鑰並加入 GitHub:
```bash
cat ~/.ssh/id_ed25519.pub
```
前往 GitHub → Settings → SSH and GPG keys → New SSH key

3. 推送:
```bash
git remote set-url origin git@github.com:Justin21523/elio-discord-bot.git
git push origin main
```

---

## 步驟 2: 設定 GitHub Actions Secrets

前往 GitHub repo → Settings → Secrets and variables → Actions

新增以下 secrets:

| Secret Name | Value | 說明 |
|-------------|-------|------|
| `DEPLOY_SSH_KEY` | (你的 SSH 私鑰) | 用於連線到伺服器 |
| `DEPLOY_HOST` | `live.dothost.net` | 伺服器主機名 |
| `DEPLOY_USER` | `neojustin` | SSH 使用者名稱 |
| `DEPLOY_PORT` | `2965` | SSH 連接埠 |
| `DEPLOY_PATH` | `~/elio-discord-bot` | 部署目錄 |

---

## 步驟 3: 檢查遠端伺服器 SSH

目前 SSH 連線失敗 (port 2965)，請檢查：

1. **確認伺服器 SSH 服務狀態**
   - 登入伺服器控制台檢查 sshd 是否運行
   - 檢查防火牆設定

2. **測試連線**:
```bash
ssh -p 2965 neojustin@live.dothost.net
```

3. **如果 port 不對，更新 GitHub secrets 和 workflows**

---

## 步驟 4: 手動部署到遠端伺服器

當 SSH 連線恢復後：

```bash
# 1. 連線到伺服器
ssh -p 2965 neojustin@live.dothost.net

# 2. 建立目錄 (如果不存在)
mkdir -p ~/elio-discord-bot
cd ~/elio-discord-bot

# 3. Clone 或 Pull
git clone https://github.com/Justin21523/elio-discord-bot.git .
# 或
git pull origin main

# 4. 安裝依賴
npm ci --production

# 5. 複製 .env 檔案 (需要手動建立)
cp .env.example .env
nano .env  # 編輯設定

# 6. 確保 MongoDB 運行
docker compose up -d mongo
sleep 5

# 7. 建立索引和 seed 資料
npm run ensure-indexes
npm run seed:all

# 8. 啟動 Bot
docker compose up -d bot

# 9. 部署 slash commands
npm run deploy:dev
# 或 npm run deploy:global (全域部署)

# 10. 檢查狀態
docker compose ps
docker compose logs -f bot
```

---

## 步驟 5: 驗證部署

1. **檢查 Discord Bot 狀態**:
   - Bot 應該在線 (綠點)
   - 試著使用 `/help` 或其他命令

2. **檢查新功能**:
   - `/history stats` - 查看歷史記錄統計
   - `/privacy settings` - 查看隱私設定
   - `/minigame start` - 開始小遊戲

3. **檢查 logs**:
```bash
docker compose logs --tail=100 bot
```

---

## 本地開發/測試

```bash
# 執行所有測試
npm run test:all

# 只執行 E2E 測試
npm run test:e2e

# 只執行整合測試
npm run test:integration

# 本地啟動 (需要 MongoDB)
npm run dev
```

---

## 環境變數說明

新增的環境變數 (Channel History):

```env
# 啟用/停用頻道歷史收集
CHANNEL_HISTORY_ENABLED=true

# 同步排程 (每 6 小時)
CHANNEL_HISTORY_CRON=0 */6 * * *

# 最多讀取幾天的歷史
CHANNEL_HISTORY_MAX_DAYS=7

# 保留幾天後自動刪除
CHANNEL_HISTORY_RETENTION_DAYS=90
```

---

## 故障排除

### SSH 連線問題
```bash
# 測試連線
ssh -v -p 2965 neojustin@live.dothost.net

# 檢查防火牆
ping live.dothost.net
```

### Bot 無法啟動
```bash
# 檢查 logs
docker compose logs bot

# 檢查環境變數
cat .env | grep -E "DISCORD_TOKEN|APP_ID|MONGODB_URI"
```

### 資料庫連線問題
```bash
# 確認 MongoDB 運行中
docker compose ps mongo

# 測試連線
docker compose exec mongo mongosh --eval "db.adminCommand({ping: 1})"
```

---

## 提交資訊

```
commit 7685a66
feat: comprehensive testing, channel history, and CI/CD pipeline

- Phase 1: Testing Infrastructure
- Phase 2: Discord Channel History System
- Phase 3: GitHub Actions CI/CD
```
