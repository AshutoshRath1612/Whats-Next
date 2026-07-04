# Workspace Storage

What's Next? stores uploaded workspace files in Cloudflare R2 through the backend. The frontend intentionally does not show bucket URLs or object paths to users; it only exposes product actions such as Upload, Download, Link, and Delete.

## R2 Object Layout

New uploads use readable object prefixes:

```text
workspaces/
  {workspaceId}/
    files/
      {yyyy}/
        {mm}/
          {dd}/
            {entityType}/
              {entityId-or-unlinked}/
                {uploadId}/
                  {sanitized-file-name}
    backups/
      {yyyy}/
        {mm}/
          {dd}/
            {uploadId}/
              {sanitized-file-name}
```

Examples:

```text
workspaces/8f3f.../files/2026/07/03/task/bb41.../2e1c.../incident-notes.pdf
workspaces/8f3f.../files/2026/07/03/project/91aa.../426a.../launch-plan.xlsx
workspaces/8f3f.../files/2026/07/03/unlinked/unlinked/12de.../reference.png
workspaces/8f3f.../backups/2026/07/03/ae88.../whats-next-export-2026-07-03.json
```

## Notes

- `{workspaceId}` matches the workspace id in PostgreSQL.
- `{entityType}` is lower-case, for example `task`, `project`, `note`, or `unlinked`.
- `{entityId-or-unlinked}` is the linked record id when one exists.
- `{uploadId}` is a generated UUID to avoid filename collisions.
- File names are sanitized for safe R2 object keys.
- Storage usage scans both this layout and the legacy `{workspaceId}/...` prefix so existing uploaded files remain counted.
