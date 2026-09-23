# Incident: Application API Down

## Purpose
Diagnose and recover when the main Fastify backend API is unavailable.

## Impact
- Frontend application will fail to load or interact with data (CORS errors, 502/503 errors).
- Users cannot upload media or trigger processing.
- Health endpoints will fail.

## Symptoms
- HTTP 502 Bad Gateway or 503 Service Unavailable on API routes.
- The `/api/health` endpoint times out or returns a non-200 status.
- Frontend displays network connection errors.
- Logs from `node dist-api/api/server.js` show crashes or it isn't running.

## Severity
**P0** - The core application is completely down.

## Immediate Actions
1. Check if the process is currently running.
2. Attempt to restart the API process immediately to restore service if it crashed due to an unknown memory leak or panic.

## Diagnosis
1. **Check Service Status**:
   Verify if the Node.js API process is running:
   ```bash
   # If running via Docker/systemd/PM2, check the respective service manager.
   # Locally or in standard deployments:
   ps aux | grep dist-api/api/server.js
   ```

2. **Check Application Logs**:
   Look at standard output/error for the API. It uses `pino` for logging.
   Look for:
   - `EADDRINUSE`: The `PORT` (default `3001`) is already in use by another process.
   - Database connection errors (Fastify won't start if the `SELECT 1` pre-flight check fails in `main()`).
   - Missing environment variables.

3. **Verify Configuration**:
   Ensure `.env` exists and is accessible.
   Verify `PORT`, `HOST`, and `DATABASE_URL` are set correctly.

4. **Verify Database Connectivity**:
   The API fails to start if it cannot connect to PostgreSQL. See `database-failure.md` if DB connection errors are present in the logs.

## Recovery
1. **Fix Port Conflicts**:
   If port is in use, kill the conflicting process or change `PORT` in `.env`.
2. **Restart the API**:
   ```bash
   # Depending on the deployment environment:
   npm run start
   # or
   node dist-api/api/server.js
   ```
3. **Check Storage Mounts**:
   The API requires `STORAGE_ROOT` and `WORK_ROOT` directories to exist or have permissions to create them. Ensure the user running the process has write permissions to `./data`.

## Validation
1. Send a GET request to the health endpoint:
   ```bash
   curl -I http://127.0.0.1:3001/api/health
   ```
   *Expected response: HTTP 200 OK*
2. Verify the frontend can successfully communicate with the backend.

## Rollback
If a recent deployment caused the crash, revert to the previous working commit/image and restart the process.

## Escalation
Escalate to backend engineering if:
- The process continuously crashes with a fatal error in application logic (e.g., SyntaxError).
- There are issues with native dependencies breaking the Node.js runtime.

## Do Not
- **Do not** change the `DATABASE_URL` to point to a staging or local database in production.
- **Do not** wipe the `STORAGE_ROOT` or `WORK_ROOT` directories to fix permission issues, as this will result in user data loss.

## Root Cause Follow-Up
- If the crash was an Unhandled Promise Rejection or out-of-memory (OOM) error, review application code and configure process monitors (like PM2 or Docker restart policies) to automatically recover.
