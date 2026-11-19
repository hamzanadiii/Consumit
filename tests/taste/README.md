# Taste publication acceptance

Use a dedicated PostgreSQL database whose name ends in `_taste_test`; the fixture
server deliberately truncates member fixture data and refuses any other database.
Apply migrations with `bun --filter @consumit/api db:migrate:deploy` first.

With `DATABASE_URL` pointing to that isolated database, run:

```sh
bun run test:taste
```

The fixture uses supplied local artwork, a fake identity service and real PostgreSQL
member/publication repositories. It binds API 18563 and web 28114 on loopback.
Existing matching servers can be reused. Production providers are not invoked.
Repository transaction coverage is in `apps/api/src/taste/taste.integration.test.ts`;
run it with the API integration configuration and the same isolated database.
