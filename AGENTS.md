# Repository Guidelines

## Project Structure & Module Organization
- `src/` Discord 機器人主程式（入口 `src/index.js`）；`src/commands/` 放 Slash 指令，`src/services/` 包含 minigame、AI/IR、scheduler；`src/events/` 事件監聽，`src/jobs/` 排程工作，`src/handlers/` DM/主動訊息。
- `ai-service/` Python FastAPI：Markov 敘事、協同過濾/混合推薦、TF-IDF/Rocchio 檢索 API。模型輸出透過 HTTP/JSON 與 bot 對接。
- `data/` 題庫與 IR/HMM/n-gram/PMI 資料，`scripts/` 為 seed、metrics、reset、cron、RAG ingest；`docs/` 為部署與訓練指南；`docker-compose.yml`、`Makefile` 封裝容器流程；`tests/` Node 測試。

## Build, Test, and Development Commands
- `npm run dev` 本地開發；`npm start` 生產模式。
- `npm run deploy-commands`（guild）/`npm run deploy:global` 註冊 Slash schema。
- `npm run seed:all` 或目標 seed (`seed:minigames` 等)；`npm run ensure-indexes` 同步 Mongo 索引。
- `npm run verify` 確認環境；`npm test` 執行 minigame 測試；`npm run metrics`、`npm run reset:leaderboard|reset:achievements`、`npm run cron:maintenance` 產出週期報表。
- Docker：`make up|dev|logs`；AI 服務可用 `uvicorn app.app:app --reload`（需 `ai-service/.env`）。

## Coding Style & Naming Conventions
- Node 20+、ESM-only、2-space 縮排；`const`/`async-await` 優先；CamelCase 變數/函式、PascalCase 類別、kebab-case 檔名。
- 共享工具：`logger`、`metrics`、`replies`、`config/cooldowns`；避免在 handler 內寫重複邏輯。

## Testing Guidelines
- 送 PR 前跑 `npm run verify`、`npm test`；需 Mongo+AI service（或以 env 關閉 AI 邏輯）。
- 測試放近行為處（對照 `tests/minigames.test.js`），以 `data/` fixtures 保持可重現；若需外部服務請在描述標註前置作業。
- 新增人格邏輯測試：`pytest ai-service/tests/test_persona_logic.py`（CPU-only）；若關閉 LLM 也應通過。

## Commit & Pull Request Guidelines
- 採用 conventional commits（例：`feat(commands): add /minigame pmi-choice`）。PR 附摘要、風險/rollback、必要指令（例：`npm run seed:minigames`）、連結 issue，並列出已跑測試。

## Security & Configuration Tips
- 不要提交密鑰；以 `.env.example`、`ai-service/.env.example` 為模板；上線前跑 `npm run verify`。
- 注意素材授權與去識別化；檢查外部 API 敏感資料。

## ML/IR Mini-Games & Services (Log)
- Markov 風味敘事（Trivia/Adventure/Battle/Guess/Dice/Reaction/N-gram/HMM）；AI_DISABLED 時改靜態文本。
- Persona logic chat（TF-IDF + Markov + mood HMM）取代 LLM，對提及的角色以 webhook/頭像回覆。
- 推薦：Python 協同過濾 + 人氣/勝率/成就混合，`/minigame recommend` 提供理由與開局按鈕；JS fallback 保留。
- IR 套件：Clue Hunt (TF-IDF)、Document Hunt (TF-IDF + pseudo Rocchio)、HMM Sequence、N-gram Story、PMI Association、PMI Choice（多選）。
- 冷卻/限次：`src/config/cooldowns.js` 套用至抽卡、猜數、擲骰、戰鬥回合、開局等。
- 週期作業：`cron:maintenance` 內含 metrics/leaderboard/achievements reset，可接 scheduler；事件/metrics 由 `scripts/compute-user-metrics.js` 等生成。

## Planned Next Steps
- 擴充推薦特徵（勝率/時段/成就混合）、理由展示與 UI 互動。
- 更多 IR/HMM/n-gram/PMI 遊戲場景與 Markov 事件卡，並持續美化 Discord embed/button 版面。
- 將排程完全接入 bot scheduler，確保冷卻與限次規則覆蓋所有模組。
