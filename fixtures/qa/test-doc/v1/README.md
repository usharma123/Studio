# V1 baseline — shared store, no MQ (graph-impact demo)

This is the **V1 baseline** for the graph-aware release-impact demo. The HLD models three high-level
components — the **UI** (`HLD-COMP-001`), the **Database** (`HLD-COMP-010`, the shared store), and the
**Matching engine** (`HLD-COMP-005`). The Database is **written by the UI** and **read by the UI**
(dashboard/audit) **and the Matching engine** — so it has one upstream writer and two readers. It does
**not** contain the counterparty MQ ingest path.

- `01/02/03/04-*.md` — editable source for this V1 evidence pack.
- `01/02/03/04-*.docx` — generated ingestion artifacts for upload.

The **V2** pack that adds the MQ writer (`HLD-COMP-009 → store`, making the store's upstream sources go
**1 → 2**) is `MVP/test-doc/v2/`. The full demo runbook lives there.

Because V1 and V2 share byte-identical store-dependency prose (HLD §11.1), the V1→V2 graph diff includes
the new `HLD-COMP-009 WRITES_TO HLD-COMP-010` edge, which is the dependency-edge impact the demo
showcases alongside the explicit V2 requirement delta. Regenerate the `.docx` from this folder:

```bash
R=/Users/minimac/projects/AiTesting
for b in 01-business-requirements-document 02-functional-requirements-specification \
         03-high-level-design 04-low-level-design; do
  pandoc "$R/MVP/test-doc/v1/$b.md" -o "$R/MVP/test-doc/v1/$b.docx" \
    --to docx --resource-path "$R/MVP/test-doc/v1"
done
```
