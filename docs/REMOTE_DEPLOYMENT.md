# 遠端部署指南

## 伺服器資訊

| 項目 | 值 |
|------|-----|
| 主機 | `live.dothost.net` |
| SSH Port | `2965` |
| 使用者 | `neojustin` |
| 專案路徑 | `~/elio-discord-bot` |
| 模式 | CPU / Mock（無 GPU）|

---

## 一鍵部署（推薦）

### 基本用法

```bash
# 部署到 Dev Guild（立即生效）- 預設
./scripts/deploy-remote.sh

# 部署到全域（約 1 小時生效）
./scripts/deploy-remote.sh --global

# 同時部署 Dev + Global
./scripts/deploy-remote.sh --both

# 跳過 Slash 指令部署
./scripts/deploy-remote.sh --skip-commands

# 查看幫助
./scripts/deploy-remote.sh --help
```

### 部署腳本執行的步驟

| 步驟 | 動作 |
|------|------|
| 1/7 | 同步程式碼到遠端 (rsync) |
| 2/7 | 重建 Docker 映像 (docker-compose build) |
| 3/7 | 啟動 MongoDB + Bot 服務 |
| 4/7 | 確保資料庫索引 |
| 5/7 | Seed 資料庫 |
| 6/7 | 部署 Slash 指令 (dev/global/both) |
| 7/7 | 驗證部署狀態 |

> **注意**：執行時會提示輸入遠端 sudo 密碼（只需輸入一次）

---

## 手動部署指令

### 1. 同步程式碼到遠端

```bash
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'logs' \
  --exclude '__pycache__' \
  --exclude '.pytest_cache' \
  --exclude '*.pyc' \
  --exclude '.env' \
  --exclude 'ai-service/.env' \
  -e 'ssh -p 2965' \
  /home/justin/web-projects/elio-discord-bot/ \
  neojustin@live.dothost.net:~/elio-discord-bot/
```

### 2. SSH 登入遠端

```bash
ssh -p 2965 neojustin@live.dothost.net
```

### 3. 遠端操作指令

#### 重建並啟動服務
```bash
cd ~/elio-discord-bot

# 重建 Docker 映像
sudo docker-compose build --no-cache bot

# 停止現有服務
sudo docker-compose down

# 啟動 MongoDB
sudo docker-compose up -d mongo

# 等待 MongoDB 就緒
sleep 10

# 啟動 Bot
sudo docker-compose up -d bot
```

#### 查看服務狀態
```bash
sudo docker-compose ps
```

#### 查看日誌
```bash
# 即時日誌
sudo docker-compose logs -f bot

# 最近 100 行
sudo docker-compose logs --tail=100 bot
```

#### 重啟服務
```bash
sudo docker-compose restart bot
```

#### 停止服務
```bash
# 停止 Bot
sudo docker-compose stop bot

# 停止全部
sudo docker-compose down
```

### 4. Slash 指令部署

```bash
# 進入專案目錄
cd ~/elio-discord-bot

# Guild 指令（立即生效，僅限開發伺服器）
sudo docker-compose exec bot npm run deploy:dev

# 全域指令（約 1 小時生效，所有伺服器）
sudo docker-compose exec bot npm run deploy:global
```

### 5. 資料庫操作

```bash
# Seed 所有資料
sudo docker-compose exec bot npm run seed:all

# 或個別執行
sudo docker-compose exec bot npm run seed:personas
sudo docker-compose exec bot npm run seed:greetings
sudo docker-compose exec bot npm run seed:scenarios
sudo docker-compose exec bot npm run seed:media
sudo docker-compose exec bot npm run seed:minigames
```

---

## 常用維護指令

### 從本機執行（不需 SSH 登入）

```bash
# 查看日誌
ssh -t -p 2965 neojustin@live.dothost.net 'cd ~/elio-discord-bot && sudo docker-compose logs -f bot'

# 查看狀態
ssh -t -p 2965 neojustin@live.dothost.net 'cd ~/elio-discord-bot && sudo docker-compose ps'

# 重啟 Bot
ssh -t -p 2965 neojustin@live.dothost.net 'cd ~/elio-discord-bot && sudo docker-compose restart bot'

# 部署 Dev 指令
ssh -t -p 2965 neojustin@live.dothost.net 'cd ~/elio-discord-bot && sudo docker-compose exec bot npm run deploy:dev'

# 部署 Global 指令
ssh -t -p 2965 neojustin@live.dothost.net 'cd ~/elio-discord-bot && sudo docker-compose exec bot npm run deploy:global'
```

---

## 環境設定

### 遠端 `.env` 重要設定

```env
# Discord
DISCORD_TOKEN=your_bot_token
APP_ID=your_app_id
GUILD_ID_DEV=your_dev_guild_id

# MongoDB
MONGODB_URI=mongodb://dev:devpass@mongo:27017/?authSource=admin
DB_NAME=communiverse_bot

# AI (CPU 模式)
AI_ENABLED=false
AI_MOCK_MODE=true
```

---

## 疑難排解

### 問題：sudo 需要密碼

部署腳本使用 `ssh -t` 分配 TTY，會提示輸入密碼。如果要免密碼：

```bash
# SSH 登入遠端
ssh -p 2965 neojustin@live.dothost.net

# 編輯 sudoers
sudo visudo

# 在檔案最後加入這行
neojustin ALL=(ALL) NOPASSWD: ALL
```

### 問題：Bot 一直重啟

```bash
# 查看錯誤日誌
sudo docker-compose logs --tail=50 bot
```

常見原因：
- 模組匯入錯誤（檢查 import/export）
- 環境變數缺失（檢查 .env）
- MongoDB 連線失敗

### 問題：Slash 指令沒出現

1. 確認 `GUILD_ID_DEV` 設定正確
2. 執行 `npm run deploy:dev` 查看輸出
3. Guild 指令立即生效，全域需等 1 小時

### 問題：docker-compose 版本錯誤

```bash
# 升級 docker-compose 至 v2
sudo curl -L -o /usr/local/bin/docker-compose \
  https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64
sudo chmod +x /usr/local/bin/docker-compose
```

---

## 部署檢查清單

- [ ] 執行 `./scripts/deploy-remote.sh` 或 `--both`
- [ ] 輸入 sudo 密碼
- [ ] 確認日誌顯示 "Logged in as Elio Bot#XXXX"
- [ ] 確認日誌顯示 "Ready! Serving X guilds"
- [ ] 確認 Slash 指令已部署
- [ ] 在 Discord 測試 `/minigame start` 等指令
