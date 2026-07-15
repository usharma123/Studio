# Standalone QA infrastructure

The QA workflow owns a separate PostgreSQL system of record and a rebuildable Helix graph/vector index. It does not use desktop SQLite or the AITesting checkout.

```sh
docker compose -f infra/qa/docker-compose.yml up -d
docker compose -f infra/qa/docker-compose.yml ps
```

Defaults:

- PostgreSQL: `postgres://t3code_qa:t3code_qa@127.0.0.1:55433/t3code_qa`
- Helix: `http://127.0.0.1:18080`

Override them with `T3CODE_QA_DATABASE_URL` and `T3CODE_QA_HELIX_URL`.

The standalone React MVP parity fixture is owned by this repository under
`fixtures/qa/test-doc/v1`. It contains the complete BRD, FRS, HLD, and LLD source pack plus the HLD
diagram assets; no runtime path reads from the AITesting checkout.
