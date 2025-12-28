# Admin Web 規格（V1）

本文件定義 Discord Bot 的 Web 後台（React）資訊架構、權限模型、風險分級、審計紀錄欄位，以及各模組「Web 可操作項目」對應到 `src/commands/`、`src/jobs/`、`src/services/` 的範圍。

---

## 目標

- 讓管理者用 Web 完成 Bot 的日常維運與設定（不需 SSH / 手動改 `.env`）。
- 所有高風險操作必須可追溯（Audit log），並具備 UI 二次確認與權限限制。
- UI 要清楚、乾淨、可導覽：Top Navbar + 可伸縮 Sidebar + 分頁 + 搜尋/篩選。

---

## 導覽資訊架構（IA）

### 全域（不綁 guild）

- `Dashboard`：整體狀態總覽（Bot / Mongo / LLM / Jobs / Error）
- `Guilds`：可管理 guild 列表、安裝狀態、權限/Intents 檢查
- `Audit Log`：所有後台操作紀錄（可依 guild/user/時間/風險分級篩選）

### Guild 範圍（選定 guild 後）

Sidebar 分區（建議）：

- **Overview**
  - `Overview`：guild 狀態總覽、Bot 是否已安裝、頻道數、設定摘要
- **Automation**
  - `Schedules`：排程列表（啟用/停用/立即執行/下次執行/最近錯誤）
  - `Jobs`：Bot 端目前註冊的 cron/job（read-only + reload）
- **AI**
  - `LLM (llama.cpp)`：health、timeout/maxTokens、fallback 策略、壓力測試入口（只觸發，不顯示敏感內容）
  - `RAG`：文件/索引管理（上傳、reindex、查詢測試、來源列表）
  - `Personas`：persona catalog + per-guild persona 設定 + persona reply 測試台
- **Economy / Games**
  - `Points & Leaderboard`：查詢/調整 points、季節重置（高風險）
  - `Minigames`：題庫/難度/統計/推薦參數（以 DB 設定為主）
- **Privacy / Data**
  - `Privacy`：opt-out / deletion request 管理、匯出/刪除（高風險）
  - `Channel History`：採集設定、保留期限、索引狀態
- **Observability**
  - `Logs`：查詢/篩選（尾端 tail、關鍵字、時間窗）
  - `Metrics`：Plotly 圖表（counters/histograms/gauges）
- **System**
  - `Runtime`：健康檢查、重啟、deploy slash commands（dev/global）
  - `Feature Flags`：各模組開關（寫入 DB / config collection）

---

## 權限模型（RBAC）

### 資料來源

- Discord OAuth2：`identify guilds`
- Guild 權限判斷：`userCanManageGuild()`（owner 或 `ADMINISTRATOR` 或 `MANAGE_GUILD`）

### Web 角色（建議）

- `super_admin`（全域）：由環境變數 allowlist（Discord userId）控制；可做「Critical」操作
- `guild_admin`（每 guild）：Discord `ADMINISTRATOR`/owner；可做「High」操作
- `guild_manager`（每 guild）：Discord `MANAGE_GUILD`；可做「Medium」操作
- `read_only`：僅檢視（Dashboard/Logs/Metrics/Audit）

### 風險分級（操作門檻）

- `Low`：read-only（不改狀態）
- `Medium`：改設定/排程（可回復）
- `High`：資料大量修改、重置（需二次確認 + 必須 audit）
- `Critical`：重啟 bot、部署指令、刪除資料（需二次確認 + 再輸入確認字串 + super_admin）

---

## 審計紀錄（Audit Log）欄位

集合：`admin_audit_logs`

- `ts`: Date（server time）
- `requestId`: string（每個 request 生成）
- `actor`: `{ userId, username, discriminator, globalName? }`
- `guildId`: string | null
- `action`: string（例如 `schedules.upsert`, `runtime.restart`, `personas.update`）
- `risk`: `low|medium|high|critical`
- `ok`: boolean
- `ip`: string | null
- `userAgent`: string | null
- `meta`: object（不放 token/密碼；只放必要摘要，例如修改欄位清單）

---

## 安全機制（實作備註）

- **CSRF**：所有 state-changing API（POST/DELETE/…）要求 `X-CSRF-Token`，token 由 `/api/me` 回傳（session 綁定），並檢查 `Origin/Referer` 必須符合 `ADMIN_WEB_ORIGIN`。
- **Rate limit**：Admin Web 服務對 `/api/*`、`/auth/*` 做基本 IP-based 限流（避免暴力/濫用）。
- **Critical 操作**：UI 需二次確認 + 輸入確認字串；後端僅允許 `super_admin`。

---

## 功能對應（V1 覆蓋範圍）

> 下面是「要能在 Web 操作」的清單與在 repo 的落點；實作順序會依 UI 分頁逐步補齊。

### Bot runtime / deploy

- Web：Runtime（health / restart / deploy dev/global）
- 對應：
  - Bot 端：admin API（`src/admin/server.ts`）
  - 指令部署：`scripts/deploy-commands.js`、`scripts/deploy-commands-global.js`

### Guild 設定 / Feature flags

- Web：Feature Flags、Channel allow/deny、cooldowns
- 對應：
  - `src/config/`、`src/services/*`（以 DB collection：`guild_config`、`persona_config` 等為主）
  - 指令：`src/commands/config-*.ts`

### Schedules / Jobs

- Web：Schedules、Jobs（reload）
- 對應：
  - Admin Web：`src/admin-app/index.ts`（已包含 schedules CRUD + trigger reload）
  - Bot scheduler：`src/services/scheduler.ts`、`src/jobs/*.ts`

### Personas

- Web：Personas（CRUD + 測試台 + 匯入匯出）
- 對應：
  - Persona catalog：`src/services/persona.ts`（collection：`personas`）
  - Persona switching：`src/services/personaSwitcher.ts`
  - DM/頻道聊天：`src/handlers/dmHandlers.ts`、`src/events/messageCreate.ts`

### RAG / Knowledge base

- Web：RAG 文件上傳、reindex、查詢測試、來源管理
- 對應：
  - local RAG：`src/services/ai/localRagSearch.ts`（目前讀取 `data/rag-resources/`）
  - ingest scripts：`scripts/ingest-rag.js`、`scripts/re-embed-rag-docs.js` 等

### AI / LLM (llama.cpp)

- Web：LLM health、timeout/maxTokens、fallback 設定、壓力測試入口
- 對應：
  - llama adapter：`src/services/ai/adapters/llamaCppAdapter.ts`
  - DM/頻道：`src/handlers/dmHandlers.ts`、`src/events/messageCreate.ts`

### Economy / Leaderboards / Minigames

- Web：Points、Leaderboards、Minigames 設定/統計
- 對應：
  - points：`src/services/points.ts`（collection：`profiles`）
  - minigames：`src/services/minigames/*`、`src/commands/minigame.ts`
  - leaderboard：`src/commands/leaderboard.ts`

### Privacy / Data

- Web：opt-out、deletion request、匯出/刪除（高風險）
- 對應：
  - privacy：`src/services/privacyManager.ts`、`src/commands/privacy.ts`
  - channel history：`src/services/channelHistoryIngestion.ts`、`src/jobs/channelHistorySync.ts`

### Observability

- Web：Logs、Metrics、Alerts（V1 可先做 logs/metrics）
- 對應：
  - metrics：`src/util/metrics.ts`、bot admin `/api/metrics`
  - logs：`logs/`（docker volume）或 bot admin 提供 tail/query endpoint（V1 先 tail）
