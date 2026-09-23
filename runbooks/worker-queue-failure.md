# Incident: Worker / Queue Failure

## Purpose
Diagnose and recover when media processing jobs are stuck, failing to start, or the Redis queue backend is unavailable.

## Impact
- Users can upload files, but clips are never generated.
- Projects stay in `processing` or `pending` status indefinitely.
- System resources may sit idle.

## Symptoms
- No log output from `src/worker/runner.ts` (`media_job_completed` or `media_job_failed` missing).
- API continues to function, but processing pipelines halt.
- Redis connection errors `ECONNREFUSED` in worker or API logs.
- High number of stalled jobs in BullMQ.

## Severity
**P1** - Core application logic (media processing) is completely degraded, though the API remains accessible.

## Immediate Actions
1. Confirm if the Redis container/service is running.
2. Confirm if the worker process is running.

## Diagnosis
1. **Check Redis Service**:
   ```bash
   docker-compose ps redis
   docker-compose logs --tail=50 redis
   ```
2. **Check Worker Logs**:
   Look at standard output/error for the `worker` process.
   ```bash
   # Depending on deployment (PM2, systemd, or raw process):
   ps aux | grep dist-api/worker/runner.js
   ```
   Check for configuration issues (e.g., `REDIS_URL` mismatch) or OOM crashes in the Node.js runtime processing heavy files.
3. **Check Connection Parameters**:
   Verify `REDIS_URL` in `.env` (default is `redis://127.0.0.1:6379`).

## Recovery
1. **Restart Redis**:
   If Redis has crashed or is unresponsive:
   ```bash
   docker-compose restart redis
   ```
2. **Restart Worker Process**:
   If the worker process died silently or is caught in a bad state:
   ```bash
   npm run worker
   # or
   node dist-api/worker/runner.js
   ```
3. **Handling Stalled Jobs**:
   BullMQ automatically handles stalled jobs up to `maxStalledCount` (set to 2). If a job repeatedly stalls, it may indicate a timeout issue or the worker dying mid-process. Investigate specific media assets that trigger this behavior.

## Validation
1. Verify the worker starts successfully and logs:
   ```json
   {"level":"info","message":"media_worker_started"}
   ```
2. Monitor worker logs to ensure jobs move from pending to active to completed.

## Rollback
No rollback mechanism is explicitly provided for queue states. Dropping the Redis data (restarting with a fresh volume) will cause in-flight and pending job state loss, though source media remains in PostgreSQL/local storage.

## Escalation
Escalate if:
- Worker repeatedly crashes with `SIGSEGV` or `SIGKILL` (Out of Memory) when processing specific jobs.
- The Redis instance is exhausting memory and eviction policies are not functioning as expected.

## Do Not
- **Do not** blindly flush the Redis database (`FLUSHALL`) unless you are certain losing all queued job states is acceptable and can be reconciled against the primary PostgreSQL database.

## Root Cause Follow-Up
- Verify whether the default `concurrency: 1` setting in `src/worker/runner.ts` is causing an artificial bottleneck during high load.
- Ensure the Redis instance has appropriate memory limits and persistence settings if applicable.
