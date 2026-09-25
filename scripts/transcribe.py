import argparse
import json
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--audio", required=True)
parser.add_argument("--model", default="small")
parser.add_argument("--language", default=None)
parser.add_argument(
    "--device",
    default="auto",
    choices=["auto", "cpu", "cuda"],
    help="'auto' (default) uses a CUDA GPU if one is detected, otherwise CPU",
)
args = parser.parse_args()

import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ.setdefault("OMP_NUM_THREADS", "2")
os.environ.setdefault("MKL_NUM_THREADS", "2")

try:
    from faster_whisper import WhisperModel
except ImportError as error:
    print("faster-whisper is not installed. Run: py -3 -m pip install faster-whisper", file=sys.stderr)
    raise SystemExit(2) from error


def detect_device() -> str:
    if args.device != "auto":
        return args.device
    try:
        import ctranslate2
        if ctranslate2.get_cuda_device_count() > 0:
            return "cuda"
    except Exception as e:
        sys.stderr.write(f"GPU check failed, using CPU: {e}\n")
    return "cpu"


device = detect_device()
# float16 needs far less GPU memory than float32 and is faster on CUDA.
# On CPU, faster-whisper's own benchmarks show int8 beats float32 on BOTH
# speed and RAM (this is the actual "not much memory" fix on a CPU box).
compute_type = "float16" if device == "cuda" else "int8"

try:
    model = WhisperModel(args.model, device=device, compute_type=compute_type, cpu_threads=2)
except Exception as e:
    sys.stderr.write(
        f"Warning: Failed to load model {args.model} on {device}/{compute_type}: {e}. "
        "Falling back to tiny model on CPU.\n"
    )
    model = WhisperModel("tiny", device="cpu", compute_type="int8", cpu_threads=2)
segments, _ = model.transcribe(args.audio, language=args.language, word_timestamps=True, vad_filter=True)
result = []
for segment in segments:
    words = [{"word": word.word.strip(), "startMs": round(word.start * 1000), "endMs": round(word.end * 1000), "probability": word.probability} for word in (segment.words or [])]
    result.append({"startMs": round(segment.start * 1000), "endMs": round(segment.end * 1000), "text": segment.text.strip(), "confidence": segment.avg_logprob, "words": words})
print(json.dumps({"segments": result}))
