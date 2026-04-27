
import sys, os
from faster_whisper import WhisperModel

def ts(s):
    h = int(s // 3600); m = int((s % 3600) // 60); sec = s % 60
    return f"{h:02d}:{m:02d}:{int(sec):02d},{int((sec - int(sec))*1000):03d}"

audio, out = sys.argv[1], sys.argv[2]
device = os.environ.get("WHISPER_DEVICE", "cuda")
compute = os.environ.get("WHISPER_COMPUTE", "float16")
model = WhisperModel("large-v3", device=device, compute_type=compute)
segments, _ = model.transcribe(audio, language="vi", beam_size=5, vad_filter=True)
with open(out, "w", encoding="utf-8") as f:
    for i, seg in enumerate(segments, 1):
        f.write(f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{seg.text.strip()}\n\n")
print("OK")
