# Token radar

A pre-token launch board. It reads a DefiLlama snapshot, fits a market-cap model on protocols that already record a token, and ranks protocols that record none.

The fit is ordinary least squares in `dashboard/model.js` (`fitComps`, `impliedValue`, `farmPlan`):

`log(mcap) = a + b·log(TVL / $50M) + c·growth + d·age + e·age_missing + a shrunk category effect`

Growth is the 7-day TVL change, clamped, with a ridge on that column. Age is days from `listed_at` to `as_of`. A launch's implied value is the fitted comps value times a stated 0.50 pre-token discount. Live tokens stay off the board and show up as comps, with leave-one-out error.

## Run

```sh
node main.ts --input snapshot.json --output out
```

The grader uses `/input/snapshot.json` and `/output`. Locally, `MAKEFUN_OUTPUT_DIR` works the same way as `--output`.

The page is an ES module, so open it from a static server rooted at `out/`:

```sh
python3 -m http.server -d out 8765
```

Then open `dashboard/`. `data.js` sits beside that folder. Nothing is loaded from a network host.

[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/thomasAIcode/makefun-token-radar/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/thomasAIcode/makefun-token-radar/reward.svg)](https://make.fun/c/token-radar-01)
