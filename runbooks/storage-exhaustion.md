# Incident: Storage Exhaustion

## Purpose
Diagnose and recover when the disk volume hosting local storage for media uploads and processing reaches capacity.

## Impact
- New uploads will fail with HTTP 500 errors or disk quota errors.
- Active worker jobs will crash during `extractAudio`, `createProxy`, or `renderClip` due to `ENOSPC` (No space left on device).
- Database operations may also fail if the PostgreSQL data volume resides on the same exhausted disk.

## Symptoms
- Node.js errors in API or worker logs containing `ENOSPC`.
- System monitoring alerts for high disk usage (>90%).
- Failures when piping streams in `src/storage/local.ts` (`writeStream`).

## Severity
**P1** - The system cannot accept new work or process existing work, though read-only operations (serving cached static files, frontend loading) may temporarily survive.

## Immediate Actions
1. Halt new uploads if necessary to prevent the host OS from locking up.
2. Identify which directories are consuming the most space.

## Diagnosis
1. **Check Disk Space**:
   ```bash
   df -h
   ```
   Identify the partition hosting the application and data directories.
2. **Identify Large Directories**:
   Navigate to the project root and check the configured storage paths:
   ```bash
   # Check the sizes of STORAGE_ROOT and WORK_ROOT
   du -sh data/storage data/work
   ```
3. **Inspect the Work Directory (`WORK_ROOT`)**:
   The `data/work` directory is used for temporary processing files (proxies, raw audio, temporary SRTS). It should be empty when no jobs are actively running.
   If there are orphaned directories here, the cleanup step in `src/worker/processor.ts` (`cleanupWorkDir`) may have failed to execute due to a hard crash.

## Recovery
1. **Clear Orphaned Work Directories**:
   If the worker process is definitely stopped or there are old UUID-based directories in `data/work` that don't correspond to active jobs:
   ```bash
   # DANGEROUS: Only do this if you know no jobs are currently running!
   rm -rf data/work/*
   ```
2. **Increase Disk Space**:
   If hosting on a cloud provider (AWS EBS, GCP Persistent Disk, etc.), expand the volume size and resize the filesystem.
3. **Verify Retention Policies**:
   Check if a scheduled cron job or retention cleanup script exists to enforce `SOURCE_RETENTION_DAYS` (default 14) and `EXPORT_RETENTION_DAYS` (default 30). Currently, no automatic eviction background job is present in the provided source files, so manual cleanup of old files in `data/storage` may be required.

## Validation
1. Verify disk space has dropped to a safe threshold (< 70%):
   ```bash
   df -h
   ```
2. Upload a small test video to verify that `writeStream` succeeds.

## Rollback
Not applicable for disk expansion or safe temporary file deletion.

## Escalation
Escalate to infrastructure/DevOps if:
- Disk expansion requires downtime or modifying underlying cloud infrastructure configurations.
- You need to build and deploy an automated cron job to handle retention policy pruning of `data/storage`.

## Do Not
- **Do not** manually delete files inside `data/storage/` unless you understand that it will permanently break associated projects and clips stored in the PostgreSQL database.
- **Do not** delete the `postgres_data` volume to free up space.

## Root Cause Follow-Up
- Implement a periodic background job (e.g., via a daily cron or BullMQ recurring job) to delete files older than the retention configuration.
- Implement disk space monitoring and alerting at the infrastructure level.
