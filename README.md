# Video Pipeline

Video Pipeline là web app tạo video dọc tiếng Việt từ topic, bài viết hoặc nội dung người dùng nhập. App tự chia cảnh, tạo voice, tạo phụ đề, sinh HTML animation theo chuẩn HyperFrames, preview từng cảnh, render thành video và ghép thành `final.mp4`.

Flow chính:

```text
Topic / URL / ảnh upload
→ TrollLLM tạo kịch bản theo cảnh
→ LarVoice tạo voice
→ faster-whisper tạo SRT + word timings
→ HyperFrames HTML scene
→ Preview
→ Render scene MP4
→ XFade concat + subtitle karaoke + logo + nhạc nền
→ final.mp4
```

## Điểm Mới Của Bản Hiện Tại

- Có thể bật/tắt chế độ dùng template.
- Khi bật template: AI chọn template theo objective, sinh `templateData`, pipeline compose HTML deterministic bằng template system.
- Khi tắt template: AI tự dựng kịch bản, tạo `htmlSpec` rất chi tiết cho từng cảnh, sau đó gọi AI để sinh HTML HyperFrames riêng cho cảnh đó.
- Có hỗ trợ ảnh trong video:
  - Ảnh người dùng upload.
  - Ảnh tìm ngoài Google qua Serper Images.
  - Nếu yêu cầu có ảnh, pipeline ép cảnh có ảnh và ưu tiên template có ảnh.
- Có SFX catalog:
  - Đọc file âm thanh trong `assets/sfx`.
  - AI chọn `sfxPlan`.
  - Pipeline khớp SFX theo `timingPhrase`, SRT và word timings để chèn đúng thời điểm với voice.
- API AI đã chuyển sang TrollLLM OpenAI-compatible endpoint, model mặc định `claude-opus-4-6`.
- TrollLLM có retry tối đa 3 lần và fallback `max_completion_tokens`.
- Render HyperFrames chạy strict trước; nếu HTML AI bị strict lint chặn do lỗi như `Math.random()`, `repeat:-1`, thiếu `window.__timelines`, pipeline tự retry non-strict bằng screenshot capture để không kẹt render.
- Session có thể resume nếu pipeline lỗi hoặc server bị ngắt giữa chừng.

## Công Nghệ Sử Dụng

| Nhóm | Công nghệ |
|---|---|
| Backend | Node.js ESM, Express, WebSocket (`ws`) |
| Frontend | HTML/CSS/JavaScript thuần |
| Database | SQLite qua `better-sqlite3` |
| AI text/script/html | TrollLLM Chat Completions API |
| Text-to-Speech | LarVoice API |
| Subtitle/word timing | Python + `faster-whisper` |
| Image search | Serper Images API |
| Article scrape | Serper Scrape API |
| HTML motion/render | HyperFrames, Puppeteer/Chromium |
| Video/audio processing | ffmpeg, ffprobe |
| Upload | Multer |
| Audio/SFX | Local `assets/sfx` catalog |

## API Đang Dùng

### TrollLLM

- Endpoint: `https://chat.trollllm.xyz/v1/chat/completions`
- Header: `Authorization: Bearer $TROLLLLM_API_KEY`
- Model mặc định: `claude-opus-4-6`
- Dùng cho:
  - Sinh kịch bản nhiều cảnh.
  - Sinh `templateData` khi bật template.
  - Sinh `htmlSpec` và `sfxPlan` khi tắt template.
  - Sinh HTML HyperFrames tự do.
  - AI sửa HTML theo prompt người dùng.

### LarVoice

- Base URL: `https://larvoice.com/api/v2`
- Dùng cho:
  - Lấy danh sách voice.
  - Tạo TTS bằng endpoint `/tts_stream`.
  - Tải audio voice về từng cảnh.
  - Tạo file nghe thử voice local bằng `npm run voice:samples`.

### Serper

- Scrape article: `https://scrape.serper.dev`
- Image search: `https://google.serper.dev/images`
- Dùng cho:
  - Crawl nội dung URL bài viết vào topic.
  - Tìm ảnh minh họa nếu yêu cầu video có ảnh hoặc template cần ảnh.

### Local APIs Của App

Một số endpoint chính:

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/api/start-with-images` | Tạo project mới, có thể upload ảnh |
| `GET` | `/api/projects` | Danh sách project |
| `GET` | `/api/projects/:id` | Chi tiết project + scenes |
| `POST` | `/api/projects/:id/resume` | Tiếp tục pipeline sau lỗi |
| `GET` | `/api/projects/:id/preview/:stt` | Preview HTML của một cảnh |
| `GET` | `/api/projects/:id/scenes/:stt` | Lấy dữ liệu một cảnh |
| `PUT` | `/api/projects/:id/scenes/:stt` | Sửa voice/templateData/htmlSpec/html |
| `POST` | `/api/projects/:id/scenes/:stt/regen` | Tạo lại HTML cảnh |
| `POST` | `/api/projects/:id/scenes/:stt/edit-html` | Sửa HTML bằng AI |
| `POST` | `/api/projects/:id/scenes/:stt/regen-voice` | Tạo lại voice + SRT + HTML |
| `POST` | `/api/projects/:id/scenes/:stt/rerender` | Render lại một cảnh |
| `POST` | `/api/projects/:id/render` | Render toàn bộ scenes |
| `POST` | `/api/projects/:id/concat` | Ghép lại video cuối |
| `GET` | `/api/projects/:id/video` | Tải/xem `final.mp4` |
| `POST` | `/api/scrape-url` | Crawl nội dung từ URL |
| `GET` | `/api/video-objectives` | Danh sách objective/template |
| `GET` | `/api/larvoice/voices` | Danh sách voice |
| `POST` | `/api/larvoice/sample` | Lấy file nghe thử voice đã cache |

## Chức Năng Chính

- Nhập topic hoặc crawl bài viết từ URL.
- Chọn objective video: breaking news, explainer, documentary, tutorial, listicle, story, product demo, v.v.
- Chọn tổng thời lượng video: 1-5 phút.
- Chọn giọng LarVoice và tốc độ đọc.
- Upload ảnh minh họa, logo, nhạc nền.
- Bật/tắt subtitle karaoke.
- Bật/tắt template mode:
  - Template mode: ổn định, dễ render, theo catalog.
  - AI HTML mode: linh hoạt hơn, AI tự dựng visual scene theo `htmlSpec`.
- Tự resolve ảnh từ upload hoặc Serper Images.
- Tự tạo SFX cue theo từng cảnh.
- Preview từng cảnh trước khi render.
- Editor từng cảnh:
  - Sửa voice.
  - Sửa `templateData` hoặc `htmlSpec`.
  - Sửa HTML trực tiếp.
  - AI edit HTML.
  - Tạo lại voice + HTML.
  - Render lại từng cảnh.
- Render scene bằng HyperFrames.
- Ghép cảnh với XFade 0.5s.
- Burn subtitle karaoke và logo vào video cuối.
- Resume project sau lỗi/server restart.

## Yêu Cầu Hệ Thống

| Thành phần | Phiên bản khuyến nghị |
|---|---|
| Node.js | `>=22 <26` |
| npm | Đi kèm Node |
| Python | 3.11+ |
| ffmpeg / ffprobe | Bản hiện đại |
| Chromium | Puppeteer/HyperFrames tự dùng browser hệ thống hoặc bundled |

Cài nhanh trên macOS bằng Homebrew:

```bash
brew install node@22 ffmpeg python@3.11
```

Với Windows/Linux, cài Node.js, Python và ffmpeg theo hướng dẫn chính thức của từng hệ điều hành.

## Cài Đặt

### 1. Clone source

```bash
git clone https://github.com/<your-name>/<your-repo>.git
cd <your-repo>
```

Nếu đang làm local từ thư mục hiện tại:

```bash
cd "video-pipeline-main 2"
```

### 2. Cài Node dependencies

```bash
npm install
```

### 3. Tạo Python virtual environment

macOS/Linux:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install faster-whisper
```

Windows PowerShell:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install faster-whisper
```

Nếu máy không có CUDA/GPU, đặt Whisper chạy CPU trong `.env`:

```env
WHISPER_DEVICE=cpu
WHISPER_COMPUTE=int8
```

Nếu có CUDA, mặc định có thể dùng:

```env
WHISPER_DEVICE=cuda
WHISPER_COMPUTE=float16
```

### 4. Tạo file môi trường

```bash
cp .env.example .env
```

Điền API key thật vào `.env`:

```env
TROLLLLM_API_KEY=your_trollllm_key
TROLLLLM_BASE_URL=https://chat.trollllm.xyz/v1/chat/completions
TROLLLLM_MODEL=claude-opus-4-6
TROLLLLM_MAX_COMPLETION_TOKENS=65536

LARVOICE_API_KEY=your_larvoice_key
SERPER_SCRAPE_API_KEY=your_serper_key
```

Không commit `.env` lên GitHub.

### 5. Tạo settings local

```bash
cp settings.example.json settings.json
```

`settings.json` dùng cho cấu hình local như logo path. File này cũng không nên commit.

### 6. Kiểm tra môi trường

```bash
npm run doctor
```

Lệnh này kiểm tra Node, npm, ffmpeg, ffprobe, Python và `faster-whisper`.

### 7. Chạy app

```bash
npm start
```

Mặc định app chạy tại:

```text
http://localhost:3000
```

Đổi port nếu cần:

```bash
PORT=3002 npm start
```

Chạy chế độ auto reload khi dev:

```bash
npm run dev
```

## Tạo File Nghe Thử LarVoice

UI chỉ phát file nghe thử đã cache local. Tạo/cập nhật file mẫu bằng:

```bash
npm run voice:samples
```

Output nằm ở:

```text
public/voice-samples/
```

Các file hỗ trợ:

- `_manifest.json`: danh sách sample đã tạo.
- `_failed.json`: voice lỗi/quota lỗi để chạy lại sau.

## Cách Sử Dụng Trên UI

1. Nhập topic hoặc dán URL bài viết rồi bấm crawl.
2. Chọn `Chế độ dựng cảnh`:
   - `Dùng template`: AI chọn template trong objective.
   - `AI tự sinh HTML`: AI tự dựng `htmlSpec` và HTML từng cảnh.
3. Chọn objective video.
4. Chọn giọng LarVoice, tốc độ đọc, thời lượng video.
5. Upload ảnh nếu muốn ép video dùng ảnh.
6. Upload logo/nhạc nền nếu cần.
7. Bấm tạo video.
8. Chờ pipeline tạo HTML preview.
9. Kiểm tra/sửa từng cảnh nếu cần.
10. Bấm `Tạo Video` để render.
11. Tải `final.mp4` khi hoàn tất.

## Pipeline Chi Tiết

### B2 - Script

- Nếu bật template:
  - TrollLLM tạo danh sách scenes.
  - Chọn template theo objective.
  - Sinh `templateData` đúng schema từng template.
  - Nếu topic có yêu cầu ảnh, ưu tiên template có ảnh.

- Nếu tắt template:
  - TrollLLM tạo scenes.
  - Mỗi scene có `htmlSpec` chi tiết.
  - Mỗi scene có `sfxPlan`.
  - Pipeline dùng `htmlSpec` để gọi AI sinh HTML.

### B4 - Voice + SRT

- LarVoice tạo audio cho từng cảnh.
- Audio được pad một đoạn silence cuối cảnh.
- faster-whisper tạo SRT và word timings.
- Pipeline align lại subtitle theo voice text để giảm lỗi nhận dạng.

### B5 - HTML

- Template mode: compose HTML deterministic bằng `hyperframesTemplateSystem`.
- AI HTML mode: gọi TrollLLM để tạo HTML scene theo chuẩn HyperFrames.
- Inject SFX audio tags từ `assets/sfx`.
- Inject/fallback ảnh nếu scene bắt buộc có ảnh.
- Preview HTML trong iframe.

### B6 - Render Scene

- HyperFrames render từng scene MP4 ở 30fps.
- Strict mode chạy trước.
- Nếu HTML AI bị strict lint chặn, pipeline retry non-strict để vẫn tạo được video.
- Voice và SFX được HyperFrames render trực tiếp vào scene.

### B7 - Final Video

- Ghép các scene với XFade.
- Mix nhạc nền nếu có upload.
- Burn subtitle karaoke ASS.
- Burn logo.
- Xuất `sessions/<sessionId>/final.mp4`.

## Cấu Trúc Thư Mục

```text
.
├── server.js                         # Express API + WebSocket + static server
├── package.json
├── .env.example                      # Mẫu biến môi trường
├── settings.example.json             # Mẫu settings local
├── public/
│   ├── index.html                    # UI chính
│   ├── script.js                     # Logic frontend
│   ├── styles.css
│   └── voice-samples/                # Cache file nghe thử voice
├── src/
│   ├── pipeline.js                   # Orchestrator B2-B7
│   ├── agents/
│   │   ├── scriptAgent.js            # Sinh script/templateData/htmlSpec
│   │   ├── sceneAgent.js             # Sinh/sửa HTML scene
│   │   ├── ttsAgent.js               # LarVoice
│   │   └── whisperAgent.js           # Gọi faster-whisper
│   ├── services/
│   │   ├── aiRouter.js               # TrollLLM client + retry
│   │   ├── imageAssets.js            # Upload/Serper image resolver
│   │   ├── serperImages.js
│   │   └── sfxCatalog.js             # SFX catalog + duration probe
│   ├── renderer/
│   │   ├── hyperframesRender.js      # HyperFrames render scene
│   │   ├── hyperframesTemplateSystem.js
│   │   ├── hyperframesTemplateSchemas.js
│   │   ├── ffmpegMerge.js            # concat, subtitle, logo, music
│   │   └── hyperframes/
│   │       ├── blocks/
│   │       ├── templates/
│   │       └── catalog/objectives/   # Objective/template catalog
│   ├── db/index.js                   # SQLite project/scene state
│   ├── config/apiKeys.js             # Đọc .env và export config
│   └── utils/
├── scripts/
│   ├── doctor.mjs
│   ├── generate_larvoice_samples.mjs
│   ├── scaffold_template_catalog.mjs
│   └── whisper_srt.py
├── assets/
│   └── sfx/                          # Sound effects local
├── sessions/                         # Output runtime, không commit
├── uploads/                          # Upload runtime, không commit
└── pipeline.db                       # SQLite runtime DB, không commit
```

## NPM Scripts

| Script | Mô tả |
|---|---|
| `npm start` | Chạy server |
| `npm run dev` | Chạy server với `node --watch` |
| `npm run doctor` | Kiểm tra môi trường |
| `npm run hyperframes:doctor` | Kiểm tra HyperFrames |
| `npm run voice:samples` | Tạo mp3 nghe thử LarVoice |
| `npm run catalog:studio` | Chạy UI quản lý catalog template |
| `npm run templates:scaffold` | Scaffold template catalog |
| `npm run templates:demo` | Render demo MP4 cho template |
| `npm run hyperframes:sync-blocks` | Sync HyperFrames block registry |

## Biến Môi Trường

| Biến | Bắt buộc | Mặc định | Mô tả |
|---|---:|---|---|
| `TROLLLLM_API_KEY` | Có | | Key TrollLLM |
| `TROLLLLM_BASE_URL` | Không | `https://chat.trollllm.xyz/v1/chat/completions` | Endpoint chat completions |
| `TROLLLLM_MODEL` | Không | `claude-opus-4-6` | Model AI |
| `TROLLLLM_MAX_COMPLETION_TOKENS` | Không | `65536` | Token output tối đa |
| `LARVOICE_API_KEY` | Có | | Key LarVoice |
| `SERPER_SCRAPE_API_KEY` | Có | | Key Serper scrape/images |
| `PORT` | Không | `3000` | Port server |
| `VIDEO_PIPELINE_PYTHON` | Không | auto detect | Đường dẫn Python nếu muốn override |
| `WHISPER_DEVICE` | Không | `cuda` | `cuda` hoặc `cpu` |
| `WHISPER_COMPUTE` | Không | `float16` | `float16`, `int8`, ... |
| `TTS_SRT_CONCURRENCY` | Không | `3` | Số cảnh xử lý TTS/SRT song song |
| `HYPERFRAMES_SCENE_CONCURRENCY` | Không | `1` | Số scene render song song |
| `HYPERFRAMES_RENDER_TIMEOUT_MS` | Không | `720000` | Timeout render một scene |

## Template Catalog

Objective/template nằm tại:

```text
src/renderer/hyperframes/catalog/objectives/
```

Mỗi objective có `objective.json`, template schema/demo/template placeholder. Thêm/sửa catalog theo tài liệu:

```text
docs/template-catalog-guide.md
```

Chạy catalog studio:

```bash
npm run catalog:studio
```

## SFX Catalog

Đặt file SFX trong:

```text
assets/sfx/
```

Ví dụ:

```text
assets/sfx/
├── alert/
├── emphasis/
├── outro/
└── transition/
```

Pipeline dùng `ffprobe` để đọc duration. AI chỉ được chọn file nằm trong catalog này. Khi có `timingPhrase`, pipeline ưu tiên khớp phrase với word timings của voice để đặt SFX đúng nhịp đọc.

## Ảnh Trong Video

Pipeline nhận ảnh từ hai nguồn:

- Upload trong UI.
- Serper Images nếu scene/template cần ảnh.

Logic hiện tại:

- Nếu người dùng upload ảnh, AI có pool ảnh local để chọn.
- Nếu topic/yêu cầu có các từ như `ảnh`, `hình ảnh`, `image`, `photo`, `screenshot`, pipeline đánh dấu video cần ảnh.
- Template mode sẽ ưu tiên template có ảnh nếu yêu cầu có ảnh.
- AI HTML mode bắt buộc dùng ít nhất một ảnh local nếu scene có `imageAssets`.
- Nếu AI quên render ảnh, pipeline inject fallback image layer.

## Dữ Liệu Runtime Không Commit

Các thư mục/file sau là dữ liệu runtime và đã được `.gitignore`:

```text
node_modules/
.env
settings.json
pipeline.db*
sessions/
uploads/
tmp/
temp/
*.log
```

Trước khi push GitHub, kiểm tra:

```bash
git status --short
git diff -- src/config/apiKeys.js .env.example README.md .gitignore
```

Không commit API key thật, `pipeline.db`, output video, session, upload, `.env` hoặc preview artifact như `demo.mp4`, `_screenshots/`, `_prototypes/`, `work-*/`.

Nếu từng lỡ commit key thật, hãy rotate key ở provider trước khi public repo.

## Troubleshooting

### `faster_whisper` không import được

```bash
source .venv/bin/activate
pip install faster-whisper
npm run doctor
```

Windows:

```powershell
.\.venv\Scripts\Activate.ps1
pip install faster-whisper
npm run doctor
```

### Máy không có GPU/CUDA

Đặt trong `.env`:

```env
WHISPER_DEVICE=cpu
WHISPER_COMPUTE=int8
```

### Port 3000 bị chiếm

```bash
PORT=3002 npm start
```

### Preview cảnh 404

Preview chỉ tồn tại sau khi file `sessions/<sessionId>/html/<stt>.html` được tạo. Nếu pipeline bị ngắt trước B5, bấm `Tiếp tục`.

### HyperFrames strict lint chặn HTML AI

Renderer hiện tự retry non-strict nếu strict bị chặn bởi lint HTML AI. Với template mode, nên cố giữ strict sạch. Với AI HTML mode, prompt đã được siết để giảm lỗi nhưng fallback vẫn giúp pipeline không kẹt.

### LarVoice sample không nghe được

Chạy:

```bash
npm run voice:samples
```

Sau đó reload UI.

## Ghi Chú Bảo Mật

- Không để API key trong source code.
- Dùng `.env` local, commit `.env.example`.
- Không commit `settings.json` nếu có đường dẫn/asset riêng.
- Không commit DB/session/output do có thể chứa nội dung người dùng, URL ảnh, audio/video, log lỗi.

## License

Chưa khai báo license. Nếu public GitHub, hãy thêm `LICENSE` phù hợp trước khi phát hành.
