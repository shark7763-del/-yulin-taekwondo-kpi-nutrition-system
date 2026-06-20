# 商業版架構規格

## 決策摘要

現有 GitHub Pages + Google Apps Script + 單一 Google Sheet 適合作為展示版，不適合作為多團隊商業服務。商業版可保留目前前端的填報、計分、趨勢與教練儀表板概念，主資料層改為具備登入、租戶隔離及交易能力的 API + PostgreSQL。

建議第一版採 Supabase Auth、PostgreSQL、RLS 與 Edge Functions；付款可接 Stripe 或綠界定期定額。Google Sheet 降為匯出功能，不再作主資料庫。

## MVP 範圍

- 教練註冊、建立團隊及管理教練成員。
- 建立、停用、恢復學生；停用學生保留歷史。
- 產生可過期、可撤銷、限次使用的團隊邀請網址。
- 學生認領身分後，每日填寫 30 項 KPI、恢復與飲食基本資料。
- 教練查看今日完成率、紅黃綠狀態、六面向及個人/團隊趨勢。
- 教練回饋與歷史查詢。
- 基礎版 5 人、進階版 15 人、專業版不限制的有效學生配額。

家長後台、LINE Bot、自由品勢特殊 100 分、本週之星及複雜補訓流程延後。解憂信箱不納入產品。

## 角色與權限

| 角色 | 權限 |
| --- | --- |
| platform_admin | 平台方案、客服及稽核 |
| owner | 團隊、訂閱、教練、學生與邀請管理 |
| admin | 團隊、教練、學生與邀請管理，不可轉移 owner |
| coach | 查看本隊學生與報告、寫教練回饋 |
| athlete | 只可填寫及查看自己的資料 |

API 必須由登入 session 推得 `user_id` 與 membership，不信任前端傳入的 `role` 或 `team_id`。所有業務資料表以 RLS 強制租戶隔離。

## KPI 量表

全部題目為 1 到 5 分，且 5 分一律代表狀態良好，避免疲勞或疼痛反向題造成誤判。

| 面向 | 五個細項 |
| --- | --- |
| 技術 | 動作準確度、動作穩定度、速度與反應、力量傳遞、技術完成度 |
| 戰術 | 距離控制、出手時機、攻防轉換、對手判讀、教練戰術執行 |
| 體能 | 爆發力、肌力、肌耐力、心肺耐力、敏捷與協調 |
| 心理 | 專注力、壓力穩定、自信心、挫折恢復、訓練動機 |
| 態度 | 準時與紀律、訓練投入、主動修正、接受指導、團隊合作 |
| 生理 | 睡眠恢復、精神恢復、肌肉舒適度、傷勢安全度、整體恢復感 |

每面向為五題平均，總 KPI 為六面向等權平均。題庫須版本化；已有填報的版本不可原地修改。教練可自訂顯示文字，但不可改題目 key、面向或分數方向，以維持趨勢可比性。

## 核心資料模型

- `users`: Auth 使用者基本資料。
- `teams`: 團隊名稱、slug、時區、owner、狀態。
- `team_members`: team、user、role、status。
- `athletes`: UUID、team、認領帳號、學號、顯示名稱、active/archived。
- `invite_links`: token hash、用途、到期、使用次數、撤銷時間、建立者。
- `kpi_template_versions`: immutable 題庫版本及生效日。
- `kpi_dimensions` / `kpi_items`: 面向與 30 個穩定題目 key。
- `daily_reports`: team、athlete、report_date、題庫版本與提交狀態。
- `daily_report_answers`: report + item + 1..5 分；提交時必須剛好 30 筆。
- `coach_feedback`: 教練回饋及異動時間。
- `subscriptions`: plan、付款狀態、週期、grace period。
- `audit_logs`: actor、action、entity、before/after 與時間。

每日紀錄唯一鍵為 `(team_id, athlete_id, report_date)`，不可再使用姓名。舊資料使用 `legacy-v1` 題庫保留原始 JSON，不將舊 10 題偽造成新 30 題。

## 方案配額

配額定義為 active athletes，而不是每日紀錄筆數：basic 5、advanced 15、professional unlimited。

新增或恢復學生時，API 在同一個資料庫 transaction 鎖定 entitlement/team row，重新計算 active 數量。基礎版第 6 人及進階版第 16 人必須回 `409 plan_limit_reached`；前端只顯示升級提示。降級超額時不刪資料，禁止新增/恢復，直到停用至配額內。付款逾期經寬限期後改為唯讀。

## 分享網址流程

1. 教練建立團隊與學生名單。
2. 系統產生至少 128-bit 隨機 token，資料庫只存 token hash。
3. 學生開啟 `/join/{token}`，以學號及一次性碼認領 athlete。
4. 認領完成後建立正式 Auth session；邀請 token 不能當永久登入憑證。
5. token 支援到期、撤銷、限次使用及 rate limit。

不可用共同網址加姓名下拉直接取得權限。若提供免帳號模式，必須為每位學生產生獨立 token，且只准寫入該學生當日紀錄。

## 安全與驗收

- 身高、體重、傷病、心理與生理資料按敏感個資處理，具備傳輸/靜態加密、最小權限、匯出、刪除、保存期限及操作稽核。
- 未成年使用情境需有監護人同意及隱私告知流程。
- 測試至少涵蓋 RLS 租戶隔離、角色權限、配額與併發、邀請 token、每日 upsert、30 題完整性及學生/教練 E2E。
- 現有 GAS 公開讀寫 API、localStorage 角色切換及全域 `ADMIN_KEY` 不得帶入正式環境。

## 建置順序

1. 建立 Auth、teams、memberships、athletes 與 RLS。
2. 實作 subscription entitlement 與 5/15/unlimited 配額 transaction。
3. 建立版本化 30 題量表、daily reports/answers API。
4. 串接建團、名單、邀請及學生每日填報 UI。
5. 串接教練儀表板、趨勢、回饋與資料匯出。
6. 匯入既有資料為 legacy team，完成權限與 E2E 驗收後切正式流量。
