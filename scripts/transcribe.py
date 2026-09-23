import argparse
import json
import sys

parser = argparse.ArgumentParser()
parser.add_argument("--audio", required=True)
parser.add_argument("--model", default="small")
parser.add_argument("--language", default=None)
args = parser.parse_args()

import os
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
os.environ["OMP_NUM_THREADS"] = "2"
os.environ["MKL_NUM_THREADS"] = "2"

try:
    from faster_whisper import WhisperModel
except ImportError as error:
    print("faster-whisper is not installed. Run: py -3 -m pip install faster-whisper", file=sys.stderr)
    raise SystemExit(2) from error

try:
    model = WhisperModel(args.model, device="cpu", compute_type="float32", cpu_threads=2)
except Exception as e:
    sys.stderr.write(f"Warning: Failed to load model {args.model}: {e}. Falling back to tiny model.\n")
    model = WhisperModel("tiny", device="cpu", compute_type="float32", cpu_threads=2)
segments, _ = model.transcribe(args.audio, language=args.language, word_timestamps=True, vad_filter=True)
result = []
for segment in segments:
    words = [{"word": word.word.strip(), "startMs": round(word.start * 1000), "endMs": round(word.end * 1000), "probability": word.probability} for word in (segment.words or [])]
    result.append({"startMs": round(segment.start * 1000), "endMs": round(segment.end * 1000), "text": segment.text.strip(), "confidence": segment.avg_logprob, "words": words})
print(json.dumps({"segments": result}))
