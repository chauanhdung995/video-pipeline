#!/usr/bin/env python3
"""
TTS generator using viet-tts (CosyVoice-based) or edge-tts fallback.
Usage: python3 tts_generate.py <text_file> <output_mp3>
Prints DURATION:<seconds> to stdout on success.
"""
import sys
import os
import subprocess
import tempfile

def get_duration(path: str) -> float:
    """Get audio duration using ffprobe."""
    result = subprocess.run(
        ['ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
         '-of', 'csv=p=0', path],
        capture_output=True, text=True
    )
    return float(result.stdout.strip())

def convert_to_mp3(src: str, dst: str):
    """Convert any audio format to mp3 using ffmpeg."""
    subprocess.run(
        ['ffmpeg', '-y', '-i', src, '-b:a', '192k', '-ar', '24000', dst],
        check=True, capture_output=True
    )

def synthesize_viet_tts(text: str, output_path: str):
    """
    Try multiple viet-tts API patterns or fallback to edge-tts.
    """
    needs_convert = output_path.lower().endswith('.mp3')
    wav_path = output_path.replace('.mp3', '.wav') if needs_convert else output_path

    # Pattern 1: viet_tts.synthesize
    try:
        from viet_tts import synthesize
        synthesize(text, wav_path, voice='nam_mien_nam')
        if needs_convert and os.path.exists(wav_path):
            convert_to_mp3(wav_path, output_path)
            os.remove(wav_path)
        return
    except Exception:
        pass

    # Pattern 2: viet_tts module-level tts()
    try:
        import viet_tts
        viet_tts.tts(text=text, output_file=wav_path, speaker='nam_mien_nam')
        if needs_convert and os.path.exists(wav_path):
            convert_to_mp3(wav_path, output_path)
            os.remove(wav_path)
        return
    except Exception:
        pass

    # Pattern 3: viet_tts CLI via subprocess
    try:
        # Try both python3 and python3.11
        for py_cmd in ['python3.11', 'python3']:
            result = subprocess.run(
                [py_cmd, '-m', 'viet_tts', '--text', text, '--output', wav_path,
                 '--speaker', 'nam_mien_nam'],
                capture_output=True, text=True, timeout=120
            )
            if result.returncode == 0 and os.path.exists(wav_path):
                if needs_convert:
                    convert_to_mp3(wav_path, output_path)
                    os.remove(wav_path)
                return
    except Exception:
        pass

    # Fallback: edge-tts (Microsoft Neural TTS)
    print('[TTS] viet-tts không khả dụng, dùng edge-tts làm dự phòng...', file=sys.stderr)
    try:
        import asyncio
        import edge_tts
        async def _run():
            communicate = edge_tts.Communicate(text, 'vi-VN-NamMinhNeural', rate='+15%')
            tmp = wav_path if not needs_convert else output_path.replace('.mp3', '_edge.wav')
            await communicate.save(tmp)
            if needs_convert and tmp != output_path:
                convert_to_mp3(tmp, output_path)
                os.remove(tmp)
        asyncio.run(_run())
        return
    except Exception as e5:
        raise RuntimeError(
            f'Tất cả TTS đều thất bại. Hãy cài: pip install viet-tts edge-tts\nErr: {e5}'
        )

def main():
    if len(sys.argv) < 3:
        print('Usage: tts_generate.py <text_file> <output_path>', file=sys.stderr)
        sys.exit(1)

    text_file = sys.argv[1]
    output_path = sys.argv[2]

    with open(text_file, 'r', encoding='utf-8') as f:
        text = f.read().strip()

    if not text:
        print('Text rỗng', file=sys.stderr)
        sys.exit(1)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)

    synthesize_viet_tts(text, output_path)

    if not os.path.exists(output_path):
        print(f'Không tìm thấy file audio đầu ra: {output_path}', file=sys.stderr)
        sys.exit(1)

    duration = get_duration(output_path)
    print(f'DURATION:{duration:.3f}')

if __name__ == '__main__':
    main()
