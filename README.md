# token-radar-01-radar4

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Bozet404/token-radar-01-radar4/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Bozet404/token-radar-01-radar4/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Northline — Pre-Token Radar. Entry for [token-radar-01](https://make.fun/bounty/token-radar-01): build the best token launch radar. The program reads the sealed DefiLlama snapshot, fits a robust comps model on the 128 traded tokens in it, and ranks the 198 protocols that record no token and pass the house plausibility screen.

## What it is

- **Value, split from evidence.** Each protocol gets an implied value with a P10–P90 band and a rank range from 200 bootstrap refits — plus a confidence level (High/Medium/Low) and a reason card (drivers, one main risk, closest traded peer, data quality). Potential value and strength of evidence are never collapsed into one opaque number.
- **A stated model, tested blind.** `value = 10^a × (TVL/$100M)^b × 10^(c·g) × (age+1)^d × family` — a Huber robust fit, with 5-fold cross-validation, a blind holdout and a walk-forward test, all reported against a flat multiple, plus an ablation table (what happens to the blind score and the Top-20 when each term is dropped). Terms are kept only if the blind test keeps them.
- **Costed farm plans.** Every row carries five concrete steps and a farm economy: net if launch, break-even %, net per hands-on hour, and a Farm/Thin/Skip verdict, under stated assumptions (5% of implied value to farmers, shared pro-rata to deposit vs TVL; 8 transactions; 3 hours). A $1K/$10K deposit toggle re-nets every row, and the best net per hour is headlined.
- **A page that answers in 10 seconds.** Stats strip, top-three spotlight, formula and validation panels, scatter of traded tokens with the fit line and residual band, sortable/filterable board, and a detail view per protocol. The page recomputes every value from the formula in your browser and reports how many match board.json.

## Run it

```sh
node main.ts
```

Reads /input/snapshot.json, writes /output/*. `RADAR_SNAPSHOT` and `RADAR_OUTPUT` override the paths for local runs. Node 22+ standard library only; no install, no build step.

## License

MIT.

---

<sub>Entered on [make.fun](https://make.fun/?ref=jh2ap8xr&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
