# 遠端部署指南

## 伺服器資訊（CPU / GPU）

### CPU VPS（無 GPU）

| 項目 | 值 |
|------|-----|
| 主機 | `live.dothost.net` |
| SSH Port | `2965` |
| 使用者 | `neojustin` |
| 專案路徑 | `~/elio-discord-bot` |
| 模式 | CPU / Mock（無 GPU）|

### GPU Dedi（含 llama.cpp GPU）

| 項目 | 值 |
|------|-----|
| 主機 | `live4.dothost.net` |
| SSH Port | `2285` |
| 使用者 | `neojustin` |
| 專案路徑 | `~/elio-discord-bot` |
| GPU | `NVIDIA GeForce GTX 1050 Ti (4GB VRAM)` |
| LLM | `llama.cpp server`（建議綁 `172.18.0.1:8080` 只給 Docker bridge 內使用）|

> `live4` 若 `docker-compose` 需要 `sudo`：建議把使用者加入 `docker` group（或設定 sudoers/NOPASSWD），否則一鍵部署腳本會失敗。

---

## 一鍵部署（推薦）

### 初次設定（只做一次）

`scripts/deploy-remote.sh` 與 `remote.md` 都是本機私有檔案（gitignored），請用範例檔建立：

```bash
cp scripts/deploy-remote.example.sh scripts/deploy-remote.sh
chmod +x scripts/deploy-remote.sh
```

建立 `./.env.deploy`（不要 commit）：

```bash
cat > .env.deploy <<'EOF'
SSHPASS='your-ssh-password'
DEPLOY_HOST='neojustin@live.dothost.net'
DEPLOY_PORT='2965'
DEPLOY_PATH='~/elio-discord-bot'
EOF
```

如要部署到 GPU 主機（`live4`），改成：

```bash
cat > .env.deploy <<'EOF'
SSHPASS='your-ssh-password'
DEPLOY_HOST='neojustin@live4.dothost.net'
DEPLOY_PORT='2285'
DEPLOY_PATH='~/elio-discord-bot'
EOF
```

### 基本用法

```bash
# 部署 + 重啟服務（mongo + bot + admin-web）
./scripts/deploy-remote.sh

# 首次部署建議（含 seed + dev guild commands）
./scripts/deploy-remote.sh --seed --dev

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
| 1/4 | 同步程式碼到遠端 (rsync) |
| 2/4 | 啟動 mongo + bot + admin-web（可選 build/seed） |
| 3/4 | 部署 Slash 指令（可選 dev/global/both） |
| 4/4 | 輸出 bot/admin-web logs（tail） |

> **注意**：此腳本預設使用 `docker-compose`（不加 `sudo`）。若你的遠端需要 sudo，請把使用者加入 docker group 或自行在遠端設定 sudoers/NOPASSWD。

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

# 啟動 Bot + Admin Web
sudo docker-compose up -d bot admin-web
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
sudo docker-compose restart admin-web
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
# 先擇一設定：
# - CPU VPS
# export DEPLOY_HOST='neojustin@live.dothost.net'
# export DEPLOY_PORT='2965'
#
# - GPU Dedi
# export DEPLOY_HOST='neojustin@live4.dothost.net'
# export DEPLOY_PORT='2285'

# 查看日誌
ssh -t -p "$DEPLOY_PORT" "$DEPLOY_HOST" 'cd ~/elio-discord-bot && sudo docker-compose logs -f bot'

# 查看狀態
ssh -t -p "$DEPLOY_PORT" "$DEPLOY_HOST" 'cd ~/elio-discord-bot && sudo docker-compose ps'

# 重啟 Bot
ssh -t -p "$DEPLOY_PORT" "$DEPLOY_HOST" 'cd ~/elio-discord-bot && sudo docker-compose restart bot'

# 部署 Dev 指令
ssh -t -p "$DEPLOY_PORT" "$DEPLOY_HOST" 'cd ~/elio-discord-bot && sudo docker-compose exec bot npm run deploy:dev'

# 部署 Global 指令
ssh -t -p "$DEPLOY_PORT" "$DEPLOY_HOST" 'cd ~/elio-discord-bot && sudo docker-compose exec bot npm run deploy:global'
```

---

## 環境設定

### 遠端 `.env` 重要設定

```env
# Discord
DISCORD_TOKEN=your_bot_token
APP_ID=your_app_id
GUILD_ID_DEV=your_dev_guild_id

# Bot internal admin API（給 admin-web 讀 bot runtime 狀態/頻道清單）
BOT_ADMIN_ENABLED=true
BOT_ADMIN_PORT=3001
BOT_ADMIN_TOKEN=your_admin_token

# MongoDB
MONGODB_URI=mongodb://dev:devpass@mongo:27017/?authSource=admin
DB_NAME=communiverse_bot

# Admin Web（獨立 Web 介面）
ADMIN_WEB_PORT=3030
ADMIN_WEB_ORIGIN=https://your-admin-domain.example

# Discord OAuth2（Admin Web 使用）
DISCORD_OAUTH_CLIENT_ID=your_app_id
DISCORD_OAUTH_CLIENT_SECRET=your_oauth_secret
DISCORD_OAUTH_SCOPES=identify guilds
DISCORD_OAUTH_PERMISSIONS=8
DISCORD_OAUTH_REDIRECT_URI=https://your-admin-domain.example/auth/discord/callback

# llama.cpp（GPU 推論；若 bot 與 llama.cpp 在同一台主機，建議用 docker bridge gateway）
USE_LLAMA_SERVER=true
LLAMA_SERVER_URL=http://172.18.0.1:8080
LLAMA_TIMEOUT_MS=180000

# AI（若不使用 Python AI service 可保持關閉；但 llama.cpp 仍可用）
AI_ENABLED=false
AI_MOCK_MODE=true
```

### Discord Developer Portal 設定提醒（Admin Web）

1. OAuth2 → General → Redirects 加入：`DISCORD_OAUTH_REDIRECT_URI`
2. OAuth2 → URL Generator：
   - Login: `identify`, `guilds`
   - Install: `bot`, `applications.commands`（admin-web 內建「Install bot」按鈕會走這個流程）
3. Bot → Privileged Gateway Intents：依你 bot 需求開啟（例如 `MESSAGE CONTENT INTENT`）

---

## 疑難排解

### 問題：LLM / GPU 沒有啟動（llama.cpp）

在 GPU 主機（`live4`）：

```bash
# 檢查 VRAM 是否被其它程序佔滿
nvidia-smi
nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv

# 檢查 llama.cpp server（systemd）
sudo systemctl status llama-server

# 從主機測 health（若綁在 172.18.0.1，這個 IP 只會在主機上可用）
curl -fsS http://172.18.0.1:8080/health
```

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
