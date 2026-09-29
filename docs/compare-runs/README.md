# Compare runs in the Inspect log viewer

A prototype of run comparison for Inspect View
([inspect_ai#1327](https://github.com/UKGovernmentBEIS/inspect_ai/issues/1327)), built on this
branch (`demo/integration`) of a ts-mono fork. Not proposed upstream yet.

## Why

A score diff between two runs mixes real change with noise. The same model with identical
settings, run twice at 6 epochs on 16 InterCode CTF tasks, scored 0.906 and 0.885 and disagreed
on 8 of 96 sample-epochs. At 2 epochs that is about 3 flips from noise alone. Two serving
configurations of the same weights both scored 0.906 but disagreed on two samples in opposite
directions, which is exactly what noise looks like. So next to "regressed" or "improved" the view
marks a sample as flaky when it also flips between epochs of the same run.

## What it does

**N runs at once** (`/compare/grid`): one row per sample, each run's epochs as marks
(pass / wrong answer / hit a limit / infra error), rows sorted by disagreement, and a
quality-vs-cost chart by tokens or time.

![Seven runs of the same 16-task suite, cost axis set to time](img/grid.png)

**Two runs** (`/compare`): samples aligned by `(id, epoch)`, an outcome per sample
(regressed / improved / both-pass / both-fail, with `flaky` when a run's own epochs disagree),
and a strip of what varies, what is fixed and which config differs between the runs.

![Same model, same settings, run twice: three flaky samples](img/aa-pair.png)

![Two models on ten repo-fixing tasks, one task opened side by side](img/two-models.png)

**Two transcripts side by side**: any row opens both transcripts, scrolled together by agent
step; where one side takes extra steps the other waits and says why. Two epochs of the same
sample can be compared the same way.

![Epoch 1 vs epoch 3 of one sample: solved in 4 turns vs hit the limit at 24](img/epochs.png)

## Data in the screenshots

- `bench`: a fixed 16-task slice of [InterCode CTF from `inspect_evals`](https://github.com/UKGovernmentBEIS/inspect_evals/tree/main/src/inspect_evals/gdm_intercode_ctf) (agentic bash tasks in a
  Docker sandbox), picked to exercise the viewer on real multi-step tool use.
- `agentic-repo`: ten small repo-fixing tasks written for this demo, scored by a check script.
- Models are local open-weight models served from my own GPU box.

## Run it

```
inspect view --port 7575 --log-dir <dir with .eval logs>
cd apps/inspect && pnpm install && pnpm dev    # http://localhost:5173/#/compare
```

The dev server proxies `/api` to the view server on port 7575. Both runs must be in the same log
directory.

## Limitations

- Same log directory only.
- Serving-side configuration (slots, chat template, sampling defaults) isn't in the eval log, so
  runs that differ only there show "No config differences".
- Flaky marks come from each run's own epochs; there is no run-level significance test in the UI
  yet.
- Tried on small logs only (up to 16 samples × 6 epochs, 7 runs).

Built with an AI coding agent; scope, data, verification and review are mine.
