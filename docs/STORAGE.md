# Workspace Storage

What's Next? stores uploaded workspace files and workspace backups in Cloudflare R2 through the backend. The frontend intentionally does not show bucket URLs or object paths to users; it only exposes product actions such as Upload, Download, Link, Restore, and Delete.

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
              {entityId-or-unassigned}/
                {uploadId}/
                  {sanitized-file-name}
            workspace/
              {uploadId}/
                {sanitized-file-name}
    profiles/
      {userId}/
        avatars/
          {yyyy}/
            {mm}/
              {dd}/
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
workspaces/8f3f.../files/2026/07/03/workspace/12de.../reference.png
workspaces/8f3f.../profiles/baa8.../avatars/2026/07/03/d06b.../avatar.png
workspaces/8f3f.../backups/2026/07/03/ae88.../whats-next-export-2026-07-03.json
```

## Notes

- `{workspaceId}` matches the workspace id in PostgreSQL.
- Linked uploads use lower-case `{entityType}` folders such as `task`, `project`, or `note`.
- Linked uploads use `{entityId-or-unassigned}` as the linked record id when one exists, or `unassigned` when a link type is selected without a specific record.
- Workspace-level uploads use the `files/{yyyy}/{mm}/{dd}/workspace/...` prefix.
- Profile photos use the `profiles/{userId}/avatars/...` prefix.
- Backups use the `backups/{yyyy}/{mm}/{dd}/...` prefix and are stored as `Backup` file assets.
- `{uploadId}` is a generated UUID to avoid filename collisions.
- File names are sanitized for safe R2 object keys.
- Storage usage scans both this layout and the legacy `{workspaceId}/...` prefix so existing uploaded files remain counted.
- Restore reads the selected JSON backup through the backend, replaces workspace records in PostgreSQL, relinks any matching uploaded task files, writes an audit log entry, and keeps backup files available for future restore points.
