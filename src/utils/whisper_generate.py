#!/usr/bin/env python3
"""
Generate SRT subtitles from audio using faster_whisper.
Optimized for Mac (CPU) with fallback for GPU (CUDA).
Usage: python3 whisper_generate.py <audio_path> <srt_output_path>
"""
import sys
import os
import subprocess

def format_time(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

MAX_WORDS_PER_LINE = 5   # tối đa 5 từ mỗi dòng SRT
MAX_SECS_PER_LINE  = 3.5 # tối đa 3.5 giây mỗi dòng SRT

def generate_srt(audio_path: str, srt_path: str):
    from faster_whisper import WhisperModel

    device = "cpu"
    compute_type = "int8"
    try:
        import torch
        if torch.cuda.is_available():
            device = "cuda"
            compute_type = "float16"
    except:
        pass

    model = WhisperModel('large-v3', device=device, compute_type=compute_type)

    print(f'[Whisper] Đang nhận dạng: {audio_path}', flush=True)
    segments, _ = model.transcribe(
        audio_path,
        language='vi',
        beam_size=5,
        word_timestamps=True,   # bật để chia nhỏ theo từng từ
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=300)
    )

    # Gom tất cả word từ các segment
    all_words = []
    for seg in segments:
        if seg.words:
            all_words.extend(seg.words)

    # Chia thành các dòng SRT ngắn: tối đa MAX_WORDS_PER_LINE từ hoặc MAX_SECS_PER_LINE giây
    lines = []
    idx = 1
    chunk_words = []
    chunk_start = None

    def flush_chunk():
        nonlocal idx, chunk_words, chunk_start
        if not chunk_words:
            return
        start_ts = format_time(chunk_start)
        end_ts   = format_time(chunk_words[-1].end)
        text     = ' '.join(w.word.strip() for w in chunk_words)
        lines.extend([str(idx), f'{start_ts} --> {end_ts}', text, ''])
        print(f'[Whisper] {start_ts} --> {end_ts}: {text}', flush=True)
        idx += 1
        chunk_words = []
        chunk_start = None

    for w in all_words:
        if not w.word.strip():
            continue
        if chunk_start is None:
            chunk_start = w.start
        chunk_words.append(w)
        duration = w.end - chunk_start
        if len(chunk_words) >= MAX_WORDS_PER_LINE or duration >= MAX_SECS_PER_LINE:
            flush_chunk()

    flush_chunk()  # phần còn lại

    with open(srt_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f'[Whisper] Đã tạo {idx - 1} dòng phụ đề → {srt_path}', flush=True)

def main():
    if len(sys.argv) < 3:
        print('Usage: whisper_generate.py <audio_path> <srt_path>', file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    srt_path = sys.argv[2]

    if not os.path.exists(audio_path):
        print(f'Không tìm thấy file audio: {audio_path}', file=sys.stderr)
        sys.exit(1)

    generate_srt(audio_path, srt_path)

if __name__ == '__main__':
    main()
