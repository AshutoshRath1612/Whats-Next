# What's Next? Architecture Note

The current architecture documentation is split into two detailed documents:

- [Technical overview](TECHNICAL_OVERVIEW.md): system structure, modules, data model, API map, auth, AI, storage, logging, and verification.
- [Application flow](APPLICATION_FLOW.md): end-to-end user, request, module, AI, storage, logging, and error flows.

Short summary:

```text
client/ Next.js authenticated workspace UI
server/ NestJS REST API, Prisma, PostgreSQL, auth, logging, AI, storage
docs/   Project documentation
```

The project no longer has an active `infra/` folder. Local development uses your installed PostgreSQL instance directly.
