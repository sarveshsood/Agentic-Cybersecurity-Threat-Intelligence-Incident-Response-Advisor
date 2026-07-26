# Backup Strategy

## What to back up

| Asset                         | Method                                     | Frequency (pilot)   |
|-------------------------------|--------------------------------------------|---------------------|
| MongoDB `soc_console`         | `mongodump` / Atlas snapshots              | Daily + pre-release |
| `backend/.env` / secret store | Secure vault export (not git)              | On change           |
| Custom KB docs                | Included in Mongo `kb_docs`                | With Mongo          |
| LanceDB                       | Rebuild via reindex OR filesystem snapshot | Weekly / on demand  |
| Audit log                     | Mongo dump (legal hold exports as needed)  | Daily               |

## Example mongodump

```bash
mongodump --uri="$MONGO_URL" --db=soc_console --out=/backups/actira-$(date +%F)
```

## Validation

Restore to scratch DB monthly; login + list incidents smoke test.
