# Incident: Media Processing Failure

## Purpose
Diagnose and recover from failures occurring inside the `processMediaJob` pipeline. This includes FFMPEG errors, transcription failures (Faster Whisper), or Gemini API errors.

## Impact
- Specific video processing projects will be marked as `failed` in the database.
- Clips are not generated for affected videos.
- This often isolates failures to specific projects, but systemic failures (like API limits or missing binaries) will cause all new processing to fail.

## Symptoms
- Worker logs emit `media_job_failed` events with specific error messages (e.g., "FFMPEG STDERR", "Gemini API error").
- Projects change to a `failed` status in the frontend.
- Missing dependencies error: `spawn ffmpeg ENOENT` or `spawn python ENOENT`.

## Severity
**P1** - The primary value of the application is degraded.

## Immediate Actions
1. Identify if the failure is isolated to one specific video or systemic (affecting all recent jobs).
2. For API rate-limit errors, temporarily throttle new uploads if necessary.

## Diagnosis
1. **Check FFMPEG/FFPROBE Issues**:
   If the error is related to `probe()` or `createProxy()` inside `src/worker/processor.ts`:
   - Verify binaries exist at the paths defined in `.env` (`FFMPEG_PATH`, `FFPROBE_PATH`).
   - Check the worker logs for `FFMPEG STDERR:` output to identify codec issues or malformed input videos.
2. **Check Transcription (Faster Whisper) Issues**:
   If failing at the "transcribing" stage:
   - Verify Python is installed and accessible via `PYTHON_PATH` from `.env`.
   - Ensure `scripts/transcribe.py` is present and executable.
   - Check if the machine has enough RAM/VRAM to load the model defined in `FASTER_WHISPER_MODEL` (default: small).
3. **Check Gemini API Issues**:
   If failing at the "ranking_highlights" stage (with `generateTitles` enabled):
   - Check if `GEMINI_API_KEY` is valid.
   - Look for HTTP 429 Too Many Requests (rate limiting) or 401 Unauthorized errors in the logs.
   *Note: The code wraps Gemini in a try/catch and falls back to local rankings on failure, so this alone should not halt the entire pipeline unless the fallback also fails.*

## Recovery
1. **Fix Missing Dependencies**:
   Install `ffmpeg`, `ffprobe`, or Python dependencies if they are missing in the environment hosting the worker process.
2. **Resolve API Rate Limits**:
   If hitting Gemini API limits, wait for the quota to reset or upgrade the API tier.
3. **Retry Failed Projects**:
   The worker marks the job as `retryable_failed` in the database. Once the underlying issue is resolved, users or admins can re-trigger the project processing.

## Validation
1. Upload a short test video and confirm it passes through all stages (proxy creation, transcription, scene detection, rendering previews) successfully.
2. Verify `media_job_completed` is logged by the worker.

## Rollback
Not applicable for processing jobs. If a bad code deployment caused the failure, roll back the worker code and restart the process.

## Escalation
Escalate to engineering if:
- FFMPEG consistently fails on standard MP4 files due to unhandled codec parameters.
- Python transcription scripts are hanging indefinitely without throwing errors.

## Do Not
- **Do not** manually manipulate files in `data/work/` to try and force a job forward. The worker relies on creating isolated temporary directories per job.
- **Do not** replace `ffmpeg` binaries with untrusted versions.

## Root Cause Follow-Up
- Consider adding more robust validation of video files at the API upload stage to prevent malformed files from entering the queue.
