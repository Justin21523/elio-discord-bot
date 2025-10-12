# Communiverse Bot (MVP scaffold)
Node.js 20+, discord.js v14, MongoDB, node-cron, dotenv.

## Quick start
1) cp .env.example .env  (fill values)
2) npm install
3) npm run deploy:dev
4) npm run dev

## Folders
- src/index.js             (entry; gateway + router)
- src/config.js            (env/constants)
- src/commands/*.js        (/drop, /game)
- src/services/*.js        (scheduler, media repo, points)
- src/db/mongo.js          (Mongo client)
- src/util/replies.js      (reply helpers)
- scripts/deploy-commands.js (guild-scoped registration)

### Mongo via Docker (recommended)
```bash
docker volume create mongo_data
docker run -d --name mongo \
  -p 27017:27017 \
  -v mongo_data:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=dev \
  -e MONGO_INITDB_ROOT_PASSWORD=devpass \
  mongo:7 --auth
````

Set `.env` → `MONGODB_URI=mongodb://dev:devpass@127.0.0.1:27017/?authSource=admin`

> On WSL, prefer WSL2 and run Node inside WSL. If your repo is under `/mnt/c/...`, installation works but is slower.

````

---

# 🧪 手動測試計畫（簡版）

1. **部署指令**
   ```bash
   npm run deploy:dev
````

看到 `[CMD] Registered guild commands` 即可。

2. **啟動 bot**

   ```bash
   npm run dev
   ```

   看到：

   * `[INT] Logged in as ...`
   * `[INT] Mongo connected -> communiverse_bot`
   * `[INT] Scheduler armed from DB`

3. **塞資料**

   ```bash
   npm run seed:media
   ```

4. **在公開頻道測試**

   * `/drop now` → 只會看到 **非 NSFW** 的 media。
   * `/drop set time: 25:99` → 應回「Invalid time…」
   * `/drop set time: 09:30` → 回覆已排程。

5. **在 NSFW 頻道測試**

   * `/drop now` → 有機率丟 **NSFW** 的 media。

6. **遊戲**

   * `/game start` → 第一個點按鈕者獲勝，+10 分；
   * `/game leaderboard` → 顯示分數與等級。

---