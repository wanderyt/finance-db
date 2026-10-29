# Product Photos

## Overview

The `new-finance` website stores optional product photos with financial records.
This service describes their metadata in Drizzle, backs up their files, and forwards MCP uploads to the website.

## Design Decisions

1. The website owns image validation, filenames, access control, and deletion.
2. `fin_photos` links photos to `fin` through a foreign key with `ON DELETE CASCADE`.
3. Ownership comes from the parent record. The photo table does not duplicate `user_id`.
4. SQLite stores metadata. The sibling `uploads/product-photos` directory stores image files.
5. Each database backup has a matching `.db.uploads` directory that also includes receipts.
6. MCP write tools send requests to the website. They do not write directly to SQLite or the upload directory.

## Implementation Details

### Schema and migration

`src/db/schema.ts` exports `finPhotos`, `FinPhoto`, and `NewFinPhoto`.
The schema matches the website's photo migration:

| Column | Purpose |
| --- | --- |
| `photo_id` | Integer primary key |
| `fin_id` | Parent transaction ID with cascading metadata deletion |
| `storage_key` | Unique filename assigned by the website |
| `original_name` | Optional original upload name |
| `mime_type` | Image MIME type |
| `size_bytes` | File size |
| `sort_order` | Position in the gallery |
| `uploaded_at` | Upload timestamp |

`idx_fin_photos_order` indexes `fin_id`, `sort_order`, and `photo_id`.

Back up the database before applying the SQL patch:

```bash
sqlite3 /path/to/finance.db ".backup '/path/to/finance.before-photos.db'"
sqlite3 /path/to/finance.db < migrations/005_add_fin_photos.sql
sqlite3 /path/to/finance.db '.schema fin_photos'
```

Apply the patch once per physical database, then restart Studio after deploying the schema change.
The patch is idempotent and matches `new-finance`'s `drizzle/0004_add_fin_photos.sql`.
If the website already migrated the shared file, this patch creates no duplicate table or index.
The service does not apply this migration automatically.

### Shared storage

Both services must access the same physical database and upload directory.
For Docker, mount the same host data directory at `/app/db` in both containers.
The website uses `DATABASE_PATH=/app/db/finance.db`.
This service uses `DATABASE_URL=/app/db/finance.db`.
This service's `DATABASE_PATH` setting names a directory, unlike the website's setting.
Studio and scheduled backups also use the paths in `databases.config.json`.

```text
db/
  finance.db
  uploads/
    receipts/
    product-photos/
  backups/
    sqlite-backup-finance-<timestamp>-<uuid>.db
    sqlite-backup-finance-<timestamp>-<uuid>.db.uploads/
      receipts/
      product-photos/
```

New website photos use `YYYYMMDD_merchant_amount_<uuid>.<ext>`.
The service preserves these filenames and supports existing UUID filenames.

### Backups

`src/services/database-backup.ts` creates backups for manual and scheduled operations.
It uses SQLite's online backup API, then copies the complete sibling `uploads` directory.
The backup directory must be outside `uploads`.
The helper rejects symbolic links and verifies every referenced receipt and product photo in the copied files.
A missing referenced file fails the backup and removes its staging files.
An empty database without images receives an empty uploads companion.
If databases share an uploads directory, each backup copies that directory independently.

The helper publishes the uploads companion before publishing the SQLite file.
Normal backup discovery therefore lists only completed pairs.
Retention cleanup removes each expired SQLite file and its companion.
Legacy database-only backups remain eligible for cleanup.
Missing source databases now fail the backup operation instead of silently skipping it.

### Restore a backup

1. Stop all database users, including the website, MCP clients, Studio, and scheduled jobs.
2. Set the source backup and target data directory below.
3. Run the commands to preserve current data and restore both parts of the backup.
4. Verify SQLite integrity and image access before restarting normal use.

```bash
backup_file='/path/to/backups/sqlite-backup-finance-<timestamp>-<uuid>.db'
data_dir=/path/to/db
saved_dir="$data_dir/before-restore-$(date +%Y%m%d-%H%M%S)"

test -f "$backup_file" && test -d "$backup_file.uploads"
```

Continue only if that check succeeds.

```bash
mkdir "$saved_dir"
for name in finance.db finance.db-wal finance.db-shm uploads; do
  if test -e "$data_dir/$name"; then
    mv "$data_dir/$name" "$saved_dir/"
  fi
done
cp "$backup_file" "$data_dir/finance.db"
cp -R "$backup_file.uploads" "$data_dir/uploads"
sqlite3 "$data_dir/finance.db" 'PRAGMA integrity_check;'
```

The old SQLite sidecar files must not accompany the restored database.
Keep the preserved data until verification succeeds.
Older backups lack uploads companions and need a separate backup of the image files.

### MCP uploads

`create_fin_record` accepts optional `photo_paths` alongside the receipt's `image_path`.
Use up to six absolute paths to JPEG, PNG, or WebP files, each at most 5 MiB.
The tool sends repeated `photos` fields to `POST /api/fin/create` with the JSON `data` field.
It can send a receipt and product photos in the same request.
Requests without images retain the existing JSON format.
The website validates the image contents and supplies transaction-based filenames.
See [MCP Server](mcp-server.md#product-photos) for an input example.

### Verification

Run `yarn build` and `yarn test:photos`.
The tests use temporary databases and files, plus a local HTTP server for MCP requests.

## Known Limitations / Future Work

1. SQLite and image files do not share an atomic snapshot mechanism.
2. Concurrent image deletion can fail a backup. Retry after writes stop.
3. A process crash between publishing the uploads directory and SQLite can leave an unused uploads companion.
4. A process crash can leave a hidden staging directory. Normal retention cleanup does not remove these directories.
5. Direct Studio deletion cascades metadata but does not delete image files. Use the website for record and photo deletion.
6. MCP tools can attach photos during creation. They do not yet retrieve photos or change photos on existing records.
7. The website supports JPEG, PNG, and WebP product photos. It does not support HEIC product photos.
