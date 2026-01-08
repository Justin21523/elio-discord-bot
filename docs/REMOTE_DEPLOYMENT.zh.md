# 遠端部署指南（中文）

> 這份文件保留中文版本；英文版本請見 `docs/REMOTE_DEPLOYMENT.md`。

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
>
> 更新：`scripts/deploy-remote.sh` 已支援 `--sudo`（或自動偵測）來處理需要 sudo 的遠端 Docker。

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
# 如果遠端 Docker 需要 sudo（例如 live4）
# DEPLOY_SUDO='true'
# 如果 sudo 密碼與 SSH 密碼不同（多數情況相同，可省略）
# DEPLOY_SUDO_PASS='your-sudo-password'
EOF
```

如要部署到 GPU 主機（`live4`），改成：

```bash
cat > .env.deploy <<'EOF'
SSHPASS='your-ssh-password'
DEPLOY_HOST='neojustin@live4.dothost.net'
DEPLOY_PORT='2285'
DEPLOY_PATH='~/elio-discord-bot'
# DEPLOY_SUDO='true'
# DEPLOY_SUDO_PASS='your-sudo-password'
EOF
```

### 基本用法

```bash
# 部署 + 重啟服務（mongo + bot + admin-web）
./scripts/deploy-remote.sh

# 快速更新：只同步 bot 相關檔案 + 只重啟 bot（推薦日常更新）
./scripts/deploy-remote.sh --bot-only

# 若遠端 Docker 需要 sudo（例如 live4）
./scripts/deploy-remote.sh --bot-only --sudo

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
sudo docker compose build --no-cache bot

# 停止現有服務
sudo docker compose down

# 啟動 MongoDB
sudo docker compose up -d mongo

# 等待 MongoDB 就緒
sleep 10

# 啟動 Bot + Admin Web
sudo docker compose up -d bot admin-web
```

#### 查看服務狀態
```bash
sudo docker compose ps
```

#### 查看日誌
```bash
# 即時日誌
sudo docker compose logs -f bot

# 最近 100 行
sudo docker compose logs --tail=100 bot
```

#### 重啟服務
```bash
sudo docker compose restart bot
sudo docker compose restart admin-web
```

#### 停止服務
```bash
# 停止 Bot
sudo docker compose stop bot

# 停止全部
sudo docker compose down
```

### 4. Slash 指令部署

```bash
# 進入專案目錄
cd ~/elio-discord-bot

# Guild 指令（立即生效，僅限開發伺服器）
sudo docker compose exec bot npm run deploy:dev

# 全域指令（約 1 小時生效，所有伺服器）
sudo docker compose exec bot npm run deploy:global
```

### 5. 資料庫操作

```bash
# Seed 所有資料
sudo docker compose exec bot npm run seed:all

# 或個別執行
sudo docker compose exec bot npm run seed:personas
sudo docker compose exec bot npm run seed:greetings
sudo docker compose exec bot npm run seed:scenarios
sudo docker compose exec bot npm run seed:media
sudo docker compose exec bot npm run seed:minigames
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
ssh -t -p "$DEPLOY_PORT" "$DEPLOY_HOST" 'cd ~/elio-discord-bot && sudo docker compose logs -f bot'

# 查看狀態
ssh -t -p "$DEPLOY_PORT" "$DEPLOY_HOST" 'cd ~/elio-discord-bot && sudo docker compose ps'

# 重啟 Bot
ssh -t -p "$DEPLOY_PORT" "$DEPLOY_HOST" 'cd ~/elio-discord-bot && sudo docker compose restart bot'
```

