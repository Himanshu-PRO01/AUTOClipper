# Incident: Database Unavailable

## Purpose
Diagnose and recover from PostgreSQL database connection failures or unavailability.

## Impact
- The API server will fail to start (the `main()` function checks `pool.query("SELECT 1")`).
- The API will crash or return HTTP 500s on routes if the connection drops.
- Worker processing will fail because it cannot read/write project and clip metadata via `src/db/repository.ts`.
- The entire application is non-functional.

## Symptoms
- Logs from `api` or `worker` contain `ECONNREFUSED` targeting the PostgreSQL port.
- Logs contain `password authentication failed for user`.
- Worker `media_job_failed` events with database-related error messages.

## Severity
**P0** - Complete loss of functionality.

## Immediate Actions
1. Verify if the `postgres` Docker container (or managed database service) is running and healthy.
2. Prevent large influxes of background jobs from being queued if the DB is unreachable, to avoid compounding retry failures (if possible).

## Diagnosis
1. **Check Database Container/Service**:
   ```bash
   # If running via docker-compose (as defined in docker-compose.yml):
   docker-compose ps postgres
   # Look for "Up" and "(healthy)" status.
   ```
2. **Check Database Logs**:
   ```bash
   docker-compose logs --tail=100 postgres
   ```
   Look for out of memory (OOM) kills, disk space exhaustion on `/var/lib/postgresql/data`, or crash loops.
3. **Verify Connectivity & Credentials**:
   Check the `DATABASE_URL` in your `.env` file.
   Format: `postgres://<user>:<password>@<host>:<port>/<db>`
   (e.g., `postgres://autoclip:autoclip@127.0.0.1:5432/autoclip`)
4. **Test Connection Manually**:
   ```bash
   # Using docker exec:
   docker exec -it <postgres_container_name> pg_isready -U autoclip -d autoclip
   ```

## Recovery
1. **Restart the Database**:
   If the container is in a bad state or crashed:
   ```bash
   docker-compose restart postgres
   ```
2. **Fix Disk Space Issues**:
   If the `postgres_data` volume is full, you must allocate more space or clean up unused data (requires extreme caution).
3. **Run Migrations (If Schema Error)**:
   If the database is up but the application complains about missing tables:
   ```bash
   npm run db:migrate
   ```

## Validation
1. Verify the `postgres` container healthcheck:
   ```bash
   docker-compose ps postgres
   ```
2. Ensure the API can start up successfully without throwing pre-flight SQL errors.
3. Use `/api/health` to confirm the backend is up.

## Rollback
If a database migration caused the outage, a rollback mechanism is **not currently supported** by the `db/migrate.ts` script. Manual intervention and DBA expertise are required to reverse the SQL changes.

## Escalation
Escalate immediately if:
- The database is corrupted and a restore from backups is required.
- The `postgres_data` volume is inadvertently deleted or damaged.
- Connectivity from the application host to the database host is blocked by network changes.

## Do Not
- **Do not** delete the `postgres_data` Docker volume. This will result in permanent, irrecoverable data loss.
- **Do not** run arbitrary `DROP` or `TRUNCATE` commands to fix data issues without a verified backup.

## Root Cause Follow-Up
- Verify if automated backups for the `postgres_data` volume are correctly configured.
- Monitor database connection limits and query performance.
