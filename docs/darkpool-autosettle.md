# Dark Pool Auto-Settle

`scripts/darkpool-autosettle.mjs` is a keeper that polls ended dark-pool epochs and submits `settle_epoch` automatically when an epoch:

- has ended
- still has intent volume
- is not already closed
- is not inside retry cooldown

It stores local state in `.darkpool/darkpool-autosettle-state.json` so the same epoch is not spammed repeatedly after restarts or temporary failures.

## Dry Run

```bash
npm run darkpool:autosettle:once -- --check-only --lookback-epochs 32
```

## Run In Loop

```bash
npm run darkpool:autosettle -- --private-key APrivateKey1...
```

Useful flags:

- `--once` runs one scan cycle and exits
- `--lookback-epochs 64` scans further back for old unsettled epochs
- `--retry-cooldown-ms 180000` waits longer before retrying a failed epoch
- `--max-epochs-per-cycle 1` limits fee spend per polling cycle
- `--start-epoch 128352` backfills from a known older epoch

## Environment

The keeper accepts a dedicated env var:

```bash
DARKPOOL_SETTLER_PRIVATE_KEY=APrivateKey1...
```

The AMM program defaults are inferred from the dark-pool program:

- `privadex_darkpool_v4.aleo` -> `privadex_amm_v8.aleo`
- `privadex_darkpool_v3.aleo` -> `privadex_amm_v7.aleo`

Override only when you really need to:

```bash
DARKPOOL_AMM_PROGRAM=privadex_amm_v8.aleo
```

## Guard Against Spam

The keeper writes per-epoch state with:

- `status`
- `attemptCount`
- `lastTxId`
- `lastError`
- `nextEligibleAt`

Retry only happens after `retry-cooldown-ms`, so a bad epoch snapshot or temporary RPC issue does not trigger repeated `settle_epoch` submissions in a tight loop.

## systemd

1. Copy [privadex-darkpool-autosettle.service](/media/mdlog/mdlog/Project-MDlabs/frontend-privadex/ops/systemd/privadex-darkpool-autosettle.service) to `/etc/systemd/system/`.
2. Copy `ops/systemd/privadex-darkpool-autosettle.env.example` to `ops/systemd/privadex-darkpool-autosettle.env` and fill `DARKPOOL_SETTLER_PRIVATE_KEY`.
3. Reload and enable:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now privadex-darkpool-autosettle.service
sudo systemctl status privadex-darkpool-autosettle.service
```

## PM2

```bash
pm2 start ops/pm2/darkpool-autosettle.ecosystem.config.cjs
pm2 logs privadex-darkpool-autosettle
pm2 save
```
