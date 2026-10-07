# Endpoint Implementation Matrix

This directory holds the **deterministic endpoint-coverage matrix** for the
`@nemesis-oss/binance-sdk` repo, generated from the audit summary that
confirmed the SDK covers **133 / 386 endpoints** across 12 Binance API
collections.

| Collection             | Uploaded | Covered | Extras | Missing | Coverage |
| ---------------------- | -------: | ------: | -----: | ------: | -------: |
| USDⓈ-M Futures         |       95 |      94 |      5 |       1 |   98.9 % |
| COIN-M Futures         |       65 |      39 |      1 |      26 |   60.0 % |
| Portfolio Margin       |      109 |       0 |      0 |     109 |    0.0 % |
| Options                |       43 |       0 |      0 |      43 |    0.0 % |
| Portfolio Margin Pro   |       24 |       0 |      0 |      24 |    0.0 % |
| Crypto Loan            |       17 |       0 |      0 |      17 |    0.0 % |
| Convert SAPI           |       9 |       0 |      0 |       9 |    0.0 % |
| Algo SAPI              |       11 |       0 |      0 |      11 |    0.0 % |
| Dual Investment        |       5 |       0 |      0 |       5 |    0.0 % |
| Alpha                  |       5 |       0 |      0 |       5 |    0.0 % |
| Copy Trading           |       2 |       0 |      0 |       2 |    0.0 % |
| C2C                    |       1 |       0 |      0 |       1 |    0.0 % |
| **TOTAL**              | **386** | **133** | **6**  | **253** | **34.5 %** |

(Numbers verified against `src/registry/usdm.endpoints.ts` and
`src/registry/coinm.endpoints.ts` on `main` at `556a629`. The
`endpoint-catalog.json` is timestamped Oct 2 2026 while `main` was pushed
Oct 5 2026, so the live source registries were used as the source of
truth.)

## Files

- **`endpoint-implementation-matrix.csv`** — 392 rows × 12 columns
  (one row per endpoint × per collection, with the 6 SDK "extras" also
  tracked). Sortable / filterable in Excel, Numbers, Google Sheets, or
  any CSV viewer.
- **`build-endpoint-matrix.py`** — the generator script. Re-runs against
  the live registry files to produce a refreshed CSV when new endpoints
  land in `usdm.endpoints.ts` / `coinm.endpoints.ts`. Also produces an
  `.xlsx` with one sheet per collection plus a Summary pivot sheet; the
  XLSX is generated into `/home/z/my-project/download/` so it doesn't
  bloat the repo.

## Columns

| Column          | Description |
| --------------- | ----------- |
| `Collection`    | One of the 12 Binance API collections. |
| `HTTP Method`   | `GET` / `POST` / `PUT` / `DELETE`. |
| `Endpoint`      | Full REST path (e.g. `/fapi/v1/order`). |
| `Auth Mode`     | `public` / `apiKey` / `signed`. |
| `SDK Namespace` | Proposed client surface, e.g. `client.futures.trading`. |
| `SDK Method`    | Proposed method name, e.g. `createOrder`. |
| `Registry File` | Where the row would live (existing file or `(new)` path). |
| `Resource File` | Existing or proposed resource class file(s). |
| `Test File`     | Existing or proposed test file(s). |
| `Status`        | `Covered` / `Covered (extra)` / `Missing`. |
| `Priority`      | `P0` (account/trading critical) / `P1` (analytics + reporting) / `P2` (low-volume). |
| `Notes`         | Per-row context — e.g. "Futures TradFi Perps Contract" for the lone USDⓈ-M gap. |

## Refreshing the matrix

```bash
python3 docs/audit/build-endpoint-matrix.py
# → /home/z/my-project/download/binance-sdk-endpoint-matrix.xlsx
# → /home/z/my-project/download/binance-sdk-endpoint-matrix.csv
# (the CSV is also checked into docs/audit/endpoint-implementation-matrix.csv)
```

The script reads `src/registry/usdm.endpoints.ts` and
`src/registry/coinm.endpoints.ts` directly, so the 133 currently-covered
rows always reflect the live state of `main`. The 253 missing rows are
enumerated from canonical Binance docs; if a future audit digest
verifies a different endpoint list against the 12 uploaded collections,
update the corresponding `*_MISSING` list in `build-endpoint-matrix.py`
and re-run.
