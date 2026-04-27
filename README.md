# Video Pipeline

Web app tự động tạo video tiếng Việt từ topic — AI sinh kịch bản, TTS, HTML animation, subtitle karaoke và mix nhạc nền.

**Flow:** `Topic → Script → Normalize TTS → Asset Keywords → TTS + SRT → HTML scenes + Thumbnail → Preview → Render → Concat + Music → Subtitle + Logo`

---

## Yêu cầu hệ thống

Cài đặt các công cụ sau trước khi bắt đầu:

| Thành phần | Phiên bản | Tải về |
|---|---|---|
| Node.js | 20 – 24 | https://nodejs.org |
| Python | 3.11+ | https://www.python.org |
| ffmpeg | Bất kỳ bản hiện đại | https://ffmpeg.org/download.html |

**API keys cần có (nhập trực tiếp trên giao diện, không cần file `.env`):**

| Key | Dùng cho |
|---|---|
| Chato1 API key hoặc Gemini API key | AI — sinh script, HTML, keywords |
| LucyLab API key | Text-to-Speech tiếng Việt |

> Nếu dùng Whisper với GPU: cần CUDA tương thích với `faster-whisper`.

---

## Cài đặt

### 1. Tải source về máy

```bash
git clone https://github.com/chauanhdung995/video-pipeline.git
cd video-pipeline
```

### 2. Cài Node dependencies

```bash
npm install
```

### 3. Cài Python dependencies

**macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install faster-whisper
```

**Windows:**
```bash
python -m venv .venv
.venv\Scripts\activate
pip install faster-whisper
```

> Giữ nguyên tên thư mục `.venv` trong thư mục project — app sẽ tự tìm Python từ đây.

### 4. Thêm tài nguyên media

Dự án cần 2 thư mục media (đã có sẵn trên repo, bạn tự thêm file vào):

| Thư mục | Nội dung |
|---|---|
| `background-music/` | File nhạc nền `.mp3` |
| `brand-specificities/` | Ảnh nhân vật / brand asset `.png`, `.jpg`, `.gif`, `.mp4` |

### 5. Kiểm tra môi trường

```bash
npm run doctor
```

Lệnh này kiểm tra Node, Python, ffmpeg và `faster-whisper` đã sẵn sàng chưa.

---

## Chạy app

```bash
npm start
```

Sau đó mở trình duyệt tại: **http://localhost:3000**

> Dùng `npm run dev` để chạy với auto-reload khi sửa file.

---

## Cấu hình settings.json

Lần đầu chạy, tạo file `settings.json` từ file mẫu:

```bash
cp settings.example.json settings.json
```

Sau đó chỉnh đường dẫn trong `settings.json` cho phù hợp với máy bạn. Hoặc để nguyên và cấu hình logo trực tiếp trên giao diện web.

---

## Cách dùng

### Nhập thông tin trên UI

| Trường | Mô tả |
|---|---|
| Topic | Chủ đề video |
| AI Provider | `chato1` hoặc `gemini` |
| Chato1 / Gemini API Keys | Nhiều key — tự xoay vòng khi rate limit |
| LucyLab API Key | Key TTS |
| Voice ID | ID giọng LucyLab (để trống = dùng mặc định) |
| Output Aspect Ratio | `9:16` / `16:9` / `1:1` / `4:5` |
| Video Duration | `1 phút` / `3 phút` / `5 phút` |
| Scene Duration | `5s` / `7s` / `10s` |
| Enable Subtitles | Bật/tắt karaoke subtitle |
| Style | Style video lưu sẵn hoặc để trống |
| Logo | Upload logo overlay |
| Project Assets | Upload ảnh/video/GIF riêng cho project |

### Guardrail scene duration

| Video Duration | Scene Duration hợp lệ |
|---|---|
| 1 phút | 5s, 7s, 10s |
| 3 phút | 5s, 7s, 10s |
| 5 phút | 7s, 10s |

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
- Pipeline resumable — có thể tiếp tục từ bước bị gián đoạn.

---

## Cấu trúc thư mục

```
video-pipeline/
├── server.js                 Entry point, API routes + WebSocket
├── package.json
├── settings.json             Logo path + thư mục asset (không commit)
├── settings.example.json     Mẫu cấu hình
│
├── public/
│   ├── index.html            UI chính
│   ├── script.js
│   └── styles.css
│
├── src/
│   ├── pipeline.js           Orchestrator
│   ├── agents/               AI agents (script, TTS, scene, music...)
│   ├── renderer/             Puppeteer render + ffmpeg merge
│   ├── services/aiRouter.js  Router Chato1 / Gemini
│   ├── db/index.js           SQLite schema + queries
│   └── utils/
│
├── scripts/
│   ├── doctor.mjs            Kiểm tra môi trường
│   └── whisper_srt.py
│
├── background-music/         Thêm file .mp3 nhạc nền vào đây
├── brand-specificities/      Thêm ảnh nhân vật / brand asset vào đây
├── sound-effect/             Thư viện SFX (có sẵn)
└── uploads/                  Logo (tạo tự động)
```

---

## AI Provider

| Provider | Model | Ghi chú |
|---|---|---|
| Chato1 | `gpt-5-3` | OpenAI-compatible API |
| Gemini | `gemini-2.5-flash` | Google Generative Language API |

Cả hai hỗ trợ nhiều API key, tự xoay vòng khi rate limit. API keys được lưu trong database để resume pipeline — không cần file `.env`.
