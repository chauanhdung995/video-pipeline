# Video Pipeline

Web app tạo video tiếng Việt theo flow:

`Topic → Script → Normalize TTS → Asset Keywords → TTS + SRT → HTML scenes + Thumbnail → Preview → Render → Concat + Music → Subtitle + Logo`

---

## Tính năng

- Tạo kịch bản JSON nhiều cảnh từ topic.
- Normalize voice text cho TTS (số → chữ, tiếng Anh → phiên âm Việt).
- TTS bằng LucyLab (voice ID tuỳ chọn).
- Transcribe bằng Whisper (`large-v3`) để tạo SRT có word-timestamp.
- AI phân tích keywords để tìm brand asset, BGM, SFX phù hợp.
- AI tạo HTML animation cho từng cảnh (GSAP, anime.js, tsParticles...).
- AI tạo thumbnail HTML → render ảnh JPG.
- Preview từng cảnh trong trình duyệt trước khi render thật.
- Sửa `voice`, `visual`, `html` từng cảnh; AI edit hoặc regenerate HTML.
- Render scene dùng Puppeteer (30fps) + merge audio.
- XFade 0.5s ghép các cảnh, mix BGM + SFX.
- Burn karaoke subtitle (ASS, per-word coloring) + logo ở bước cuối.
- Tạo và lưu video style để tái sử dụng.
- Pipeline resumable — có thể tiếp tục từ bước dở.

---

## Yêu cầu hệ thống

| Thành phần | Yêu cầu |
|---|---|
| Node.js | Khuyến nghị 20 - 24 |
| Python | Khuyến nghị 3.11 |
| ffmpeg + ffprobe | Bất kỳ version hiện đại |
| Python package | `faster-whisper` |

**API keys cần có (nhập trên UI, không cần file .env):**

| Key | Dùng cho |
|---|---|
| Chato1 API key (hoặc Gemini API key) | AI — sinh script, HTML, keywords, style |
| LucyLab API key | Text-to-Speech |

Nếu dùng Whisper với GPU: cần CUDA tương thích với `faster-whisper`.

---

## Cài đặt

### Chạy nhanh nhất sau khi giải nén

Nếu bàn giao source cho người khác, cách ít lỗi nhất là dùng Antigravity hoặc IDE tương thích Dev Container cùng với Docker Desktop.

Các bước:

1. Giải nén project.
2. Cài `Docker Desktop`.
3. Mở thư mục project bằng Antigravity.
4. Chọn `Reopen in Container` hoặc `Open in Dev Container`.
5. Chờ build lần đầu xong, mở terminal và chạy:

```bash
npm start
```

6. Mở trình duyệt tại `http://localhost:3000`.

Repo đã có sẵn `.devcontainer/devcontainer.json`, nên môi trường Node, Python, ffmpeg và Chromium sẽ được dựng trong container thay vì phụ thuộc máy người dùng.

### Mô hình cài mới

Project dùng:

- `package-lock.json` để khóa Node dependencies
- `.venv/` trong project để cô lập Python dependencies
- `npm run doctor` để kiểm tra môi trường trước khi chạy

### macOS

```bash
chmod +x setup-mac.sh run-mac.sh
./setup-mac.sh
```

Script sẽ cài `node@22`, `python@3.11`, `ffmpeg`, tạo `.venv`, cài `requirements.txt`, rồi chạy `npm run doctor`.

### Windows

Chạy `setup-windows.bat`.

Script sẽ cài Node.js LTS, Python 3.11, FFmpeg, tạo `.venv`, cài `requirements.txt`, rồi chạy `npm run doctor`.

### Docker

```bash
docker compose build
docker compose run --rm app npm run doctor
docker compose up -d
```

Docker image đã chứa Node, Python, ffmpeg và Chromium cho Puppeteer. Dữ liệu runtime được giữ trong volume `video-pipeline-data`.

### Kiểm tra môi trường

```bash
npm run doctor
```

---

## Chạy app

### macOS

```bash
./run-mac.sh
```

### Windows

Chạy `run-windows.bat`.

### Trực tiếp

```bash
npm start        # production
npm run dev      # dev (auto-reload khi sửa file)
```

App chạy tại: **http://localhost:3000**

---

## Cấu trúc thư mục

```
server.js                     Entry point, tất cả API routes + WebSocket
package.json
pipeline.db                   SQLite (projects, scenes, video_styles)
settings.json                 Logo path + thư mục asset

public/
  index.html                  UI chính
  script.js                   Client logic
  styles.css

src/
  pipeline.js                 Orchestrator (runPipeline / resumePipeline)
  agents/
    scriptAgent.js            B2 — AI tạo JSON script + thumbnail metadata
    ttsNormalizeAgent.js      B2.x — AI normalize voice text cho TTS
    assetKeywordsAgent.js     B2.5 — AI trích keywords brand/BGM/SFX
    ttsAgent.js               B4 — LucyLab TTS → MP3
    whisperAgent.js           B4 — Whisper → SRT
    sceneAgent.js             B5 — AI tạo HTML từng cảnh + thumbnail HTML
    musicAgent.js             B7 — AI lập kế hoạch BGM + SFX
  renderer/
    puppeteerRender.js        B6 — Puppeteer render HTML → frames → MP4
    ffmpegMerge.js            B7 — Merge audio, concat, subtitle, logo, music
  services/
    aiRouter.js               Router Chato1 (gpt-5-3) / Gemini 2.5 Flash
  db/
    index.js                  SQLite schema + queries
  utils/
    state.js                  state.json, events.log, render trigger
    settings.js               Đọc/ghi settings.json
    assetSearch.js            Scan media cache + keyword matching
    whisper_generate.py       Python script gọi faster-whisper

sessions/
  <sessionId>/
    state.json                Pipeline state (resumable)
    events.log
    script.json               Kết quả B2
    music_plan.json           Kết quả B7 AI
    audio/                    1.mp3, 2.mp3, ...
    srt/                      1.srt, 2.srt, ...
    html/                     1.html, 2.html, ..., thumbnail.html
    video/                    1_silent.mp4, 1.mp4, ..., final*.mp4
    thumbnail/                thumbnail.jpg
    assets/                   File upload của project

brand-specificities/          Brand asset dùng chung (characters, backgrounds)
background-music/             Thư viện BGM
sound-effect/                 Thư viện SFX
uploads/                      Logo
```

---

## Cấu hình trên UI

| Trường | Mô tả |
|---|---|
| Topic | Chủ đề video |
| AI Provider | `chato1` hoặc `gemini` |
| Chato1 / Gemini API Keys | Nhiều key — tự xoay vòng khi rate limit |
| LucyLab API Key | Key TTS |
| Voice ID | ID giọng LucyLab (để trống = dùng mặc định) |
| Output Aspect Ratio | `9:16` / `16:9` / `1:1` / `4:5` |
| Video Duration | `1 phút` / `3 phút` / `5 phút` |
| Scene Duration | `5s` / `7s` / `10s` (xem guardrail bên dưới) |
| Enable Subtitles | Bật/tắt karaoke subtitle |
| Style | Style video lưu sẵn hoặc để trống (dùng default) |
| Logo | Upload logo overlay |
| Project Assets | Upload ảnh/video/GIF cho project |

### Guardrail scene duration

| Video Duration | Scene Duration hợp lệ |
|---|---|
| 1 phút | 5s, 7s, 10s |
| 3 phút | 5s, 7s, 10s |
| 5 phút | 7s, 10s |

---

## Pipeline chi tiết

### B1 — Start project

`POST /api/start`

Server tạo `sessionId`, resolve `projectAssets` thành `file://...`, lưu state ban đầu, chạy pipeline trong background. Client kết nối WebSocket nhận progress realtime.

### B2 — Generate script

`src/agents/scriptAgent.js`

AI tạo JSON script gồm nhiều cảnh và metadata thumbnail.

- Số cảnh = `ceil(videoDurationSec / sceneDurationSec)`
- Words/cảnh = `max(8, round(sceneDurationSec × 3.35))`
- Video 5 phút: cấu trúc tường thuật (intro → điểm chính → kết luận)
- Video ngắn hơn: hook → nội dung nhanh → call to action
- Retry 1 lần nếu AI trả sai số cảnh

### B2.x — Normalize TTS voices

`src/agents/ttsNormalizeAgent.js`

AI viết lại voice text để TTS đọc tự nhiên hơn: số → chữ, từ tiếng Anh → phiên âm (AI → "ây ai", KPI → "cây bi ai", CEO → "xi i ô"...). Output lưu vào field `ttsVoice` của mỗi cảnh.

### B2.5 — Extract asset keywords

`src/agents/assetKeywordsAgent.js`

AI phân tích script, trả ra keywords để:
- Tìm brand asset phù hợp từng cảnh
- Chọn BGM (background music)
- Chọn SFX (sound effects)

### B4 — TTS + Whisper

`src/agents/ttsAgent.js` + `src/agents/whisperAgent.js`

1. LucyLab TTS: gọi `ttsLongText` RPC → poll trạng thái → tải WAV → convert MP3 (192kbps 24kHz)
2. Thêm 700ms silence cuối mỗi cảnh tạo khoảng nghỉ tự nhiên
3. Whisper `large-v3` tạo SRT có word-timestamp
4. Pipeline greedy-align SRT với voice script để sửa chính tả

### B5 — Generate scene HTML + thumbnail

`src/agents/sceneAgent.js`

- Tối đa **3 cảnh song song**
- Mỗi HTML nhận: beat timing từ SRT, style guide, brand/project assets, layout rules theo tỉ lệ
- Tỉ lệ và kích thước:

| Ratio | Viewport | Dùng cho |
|---|---|---|
| `9:16` | 1080×1920 | TikTok, Reels |
| `16:9` | 1920×1080 | YouTube |
| `1:1` | 1080×1080 | Instagram square |
| `4:5` | 1080×1350 | Instagram portrait |

- Thumbnail: AI tạo riêng HTML tĩnh → Puppeteer chụp JPG tại t=1800ms

### Preview gate

Sau khi tất cả HTML xong:
- State chuyển → `preview`, broadcast `preview_ready`
- UI cho xem preview từng cảnh (file:// path được rewrite thành endpoint local)
- User có thể: sửa `voice` / `visual` / `html`, AI regenerate, AI edit HTML, rerender riêng cảnh
- Chỉ khi bấm **Tạo Video** pipeline mới tiếp tục

### B6 — Render scene video

`src/renderer/puppeteerRender.js`

- Tối đa **3 cảnh song song**
- Puppeteer headless, inject time control (mock `performance.now`, `requestAnimationFrame`)
- Capture frames 30fps JPEG → ffmpeg → H.264 MP4 (veryfast)
- Thời lượng render = thời lượng audio thật đo bằng ffprobe

### B7 — Final concat

`src/renderer/ffmpegMerge.js` + `src/agents/musicAgent.js`

1. AI lập kế hoạch BGM + SFX (file, timestamp, volume, giới hạn 3–8 SFX/video)
2. XFade 0.5s ghép các cảnh
3. Mix BGM (volume 0.08–0.15) + SFX (volume 0.6–1.0), BGM fade-out 3s cuối
4. Burn karaoke subtitle ASS (per-word yellow highlight, font Be Vietnam Pro 68px) + logo top-right

---

## API

### Settings

| Method | Route | Mô tả |
|---|---|---|
| GET | `/api/settings` | Logo path, tên file, trạng thái |
| POST | `/api/settings/logo` | Upload logo mới |
| DELETE | `/api/settings/logo` | Xoá logo |

### Styles

| Method | Route | Mô tả |
|---|---|---|
| GET | `/api/styles` | Danh sách video style |
| POST | `/api/styles/generate` | AI tạo style mới từ domain |
| DELETE | `/api/styles/:id` | Xoá style (ID 1 = default, không xoá được) |

### Project lifecycle

| Method | Route | Mô tả |
|---|---|---|
| POST | `/api/start` | Khởi tạo và chạy pipeline |
| POST | `/api/resume/:id` | Resume project bị gián đoạn |
| GET | `/api/projects` | Danh sách project |
| GET | `/api/projects/:id` | Chi tiết project |
| DELETE | `/api/projects/:id` | Xoá project |
| DELETE | `/api/projects` | Xoá tất cả project |
| POST | `/api/projects/:id/upload-assets` | Upload asset cho project (100MB/file) |

### Scene editing

| Method | Route | Mô tả |
|---|---|---|
| GET | `/api/projects/:id/preview/:stt` | HTML preview (file:// → local endpoint) |
| GET | `/api/projects/:id/scenes/:stt` | Scene data + HTML content |
| PUT | `/api/projects/:id/scenes/:stt` | Cập nhật voice/visual/html |
| POST | `/api/projects/:id/scenes/:stt/regen` | AI tạo lại HTML hoàn toàn |
| POST | `/api/projects/:id/scenes/:stt/edit-html` | AI sửa HTML hiện tại theo instruction |
| POST | `/api/projects/:id/scenes/:stt/rerender` | Render lại riêng cảnh |
| GET | `/api/projects/:id/scenes/:stt/video` | Tải MP4 của cảnh |

### Thumbnail

| Method | Route | Mô tả |
|---|---|---|
| GET | `/api/projects/:id/thumbnail` | State thumbnail |
| PUT | `/api/projects/:id/thumbnail` | Cập nhật title/prompt/html |
| GET | `/api/projects/:id/thumbnail/preview` | HTML preview |
| GET | `/api/projects/:id/thumbnail/image` | Tải JPG |
| POST | `/api/projects/:id/thumbnail/regen` | AI tạo lại thumbnail HTML |

### Render / output

| Method | Route | Mô tả |
|---|---|---|
| POST | `/api/projects/:id/render` | Kích hoạt render đầy đủ (B6 + B7) |
| POST | `/api/projects/:id/concat` | Chỉ chạy concat (B7, cảnh đã render sẵn) |
| GET | `/api/projects/:id/video` | Tải final.mp4 |

---

## Database

SQLite (`pipeline.db`, WAL mode) — 3 bảng chính:

**`projects`** — `id`, `topic`, `status`, `created_at`, `updated_at`, `chato1_keys`, `output_aspect_ratio`, `final_video`

**`scenes`** — `project_id`, `stt`, `voice`, `visual`, `srt`, `duration`, `audio_done`, `srt_done`, `html_done`, `render_done`, `updated_at`

**`video_styles`** — `id`, `name`, `description`, `style_guide`, `created_at`

Project status flow: `pending` → `running` → `preview` → `running` → `done` / `error`

---

## Resume behavior

Pipeline đọc `state.json` để bỏ qua bước đã hoàn thành:
- Scene nào có `audio_done=1`, `srt_done=1`, `html_done=1`, `render_done=1` → không chạy lại
- Script, asset keywords, music plan đã có → không gọi AI lại
- Có thể resume từ giữa pipeline hoặc sau khi máy tắt đột ngột

---

## AI provider

`src/services/aiRouter.js` — `callAI({ prompt, isJson, keys, onLog })`

| Provider | Model | Endpoint |
|---|---|---|
| Chato1 | `gpt-5-3` | `https://chat01.ai/v1/chat/completions` (OpenAI-compatible) |
| Gemini | `gemini-2.5-flash` | Google Generative Language API |

Cả hai đều hỗ trợ nhiều API key, tự xoay vòng khi rate limit. Gemini: cooldown 65s sau 429. Chato1: chuyển key khi quota/401/403.

---

## Lưu ý

- API keys được gửi theo request và lưu trong `state.json` để resume — không cần file `.env`.
- Whisper luôn dùng model `large-v3`. Tự detect GPU (CUDA) nếu có, fallback CPU int8.
- Logo luôn được burn vào video cuối, kể cả khi tắt subtitle.
- Character mascot brand xuất hiện mỗi 3 cảnh (stt % 3 === 1).
- Preview HTML rewrite `file://` sang endpoint local để iframe hiển thị được trong browser.
