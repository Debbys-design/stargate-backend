# Stargate Database Recovery

## Targets

- RTO: less than 1 hour.
- RPO: less than 5 minutes when provider point-in-time recovery is enabled.

## Backup Policy

- Enable provider PITR for the production PostgreSQL database.
- Keep daily encrypted logical backups for at least 30 days.
- Store backups outside the primary database provider account.
- Test restore before launch and after every material schema change.

## Restore Procedure

1. Identify the restore point or backup file.
2. Provision a fresh PostgreSQL instance.
3. Restore the selected PITR snapshot or logical dump.
4. Verify critical table row counts: merchants, invoices, payment events, ledger entries, settlements, webhooks.
5. Run `npm run db:migrate` against the restored database.
6. Point a staging API instance at the restored database and run smoke tests.
7. Promote only after approval from the launch owner.

## Logical Backup Example

```sh
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump "$DATABASE_DIRECT_URL" \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "env:ENCRYPTION_KEY" \
  > "stargate_prod_${TIMESTAMP}.sql.gz.enc"
```
