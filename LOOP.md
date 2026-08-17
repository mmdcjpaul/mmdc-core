# Autonomous implementation loop

`loop.sh` takes the next ticket from [`docs/specs/tracker.md`](docs/specs/tracker.md), invokes Codex with the selected model, validates the result, and either commits it or stops at the first blocker.

## Deterministic rule

```text
resume the In progress ticket, otherwise take the first Not started ticket
  -> require all dependencies to be Done
  -> set In progress
  -> ask Codex to implement only that ticket
  -> ./validation.sh <ticket>
       exit 0: set Done, commit, continue
       nonzero: repair autonomous work, up to MAX_ATTEMPTS total
       guarded nonzero: stop after GUARDED_MAX_ATTEMPTS total
       still nonzero: set Blocked, append BLOCKED.md, stop nonzero
```

Bash owns selection, retry counting, status transitions, validation, committing, and halting. Codex owns implementation and the task-specific acceptance script. The acceptance script must implement the spec's entire validation contract; changing it to evade a requirement is a failure.

Ticket autonomy comes from the spec frontmatter. `autonomous` tickets use the
full repair budget. `guarded` tickets still perform all safe repository work,
but default to one attempt so a missing human decision, credential, or external
approval does not spend repeated model runs on an impossible repair.

The loop never skips a failed ticket. An interrupted run resumes its single `In progress` row.

## Run

Pass the Codex model as the first argument and, optionally, its reasoning effort as the second:

```bash
MAX_TICKETS=1 ./loop.sh <model-id> <reasoning-effort>
```

After the smoke test:

```bash
./loop.sh <model-id> <reasoning-effort>
```

Or set it once:

```bash
LOOP_MODEL=<model-id> LOOP_REASONING_EFFORT=<reasoning-effort> ./loop.sh
```

For example, Luna with high reasoning is:

```bash
MAX_TICKETS=1 ./loop.sh gpt-5.6-luna high
```

The loop uses `codex exec --model <model-id> --config model_reasoning_effort="<reasoning-effort>" --approve-for-me`. The `--approve-for-me` option enables automatic approval review and selects the `workspace-write` sandbox; the Codex CLI rejects combining it with an explicit `--sandbox` option. Authentication must already be configured.

## Options

| Variable | Default | Purpose |
| --- | --- | --- |
| `LOOP_MODEL` | none | Model when no positional model is supplied |
| `LOOP_REASONING_EFFORT` | model default | Reasoning effort when no second argument is supplied |
| `CODEX_BIN` | `codex` | Codex executable path/name |
| `MAX_ATTEMPTS` | `3` | Total implementation/repair attempts per ticket |
| `GUARDED_MAX_ATTEMPTS` | `1` | Maximum attempts for a guarded ticket; capped by `MAX_ATTEMPTS` |
| `MAX_TICKETS` | `0` | Stop after N passing tickets; `0` means no limit |
| `NO_COMMIT` | unset | Set to `1` to skip one commit per passing ticket |
| `ALLOW_DIRTY` | unset | Set to `1` to explicitly allow a dirty baseline |

Logs are written under `.loop-logs/`. After the final failed attempt, the loop appends sanitized validation output to `BLOCKED.md`, marks the ticket `Blocked`, and exits nonzero.

The loop refuses a fresh committed run when the working tree is dirty unless `NO_COMMIT=1` or `ALLOW_DIRTY=1` is explicit. This prevents a ticket commit from accidentally absorbing unrelated work. Interrupted `In progress` tickets may resume with their working changes. `AGENTS.md`, the implementation plan, EARS specs, tracker state, and loop/validation harness are fingerprinted per ticket; an agent edit to those controls fails the attempt.

## Guarded work

Some tickets require human decisions, credentials, approvals, or external cloud evidence. Codex must not invent them. If the requirement cannot be satisfied with current authority and evidence, validation remains nonzero and the loop stops. Resolve the blocker, remove or close its `BLOCKED.md` entry, set the tracker row back to `Not started`, and rerun.

Before an unattended run, review the selected model's edits on the first ticket, confirm the acceptance script meaningfully tests every criterion, and ensure the repository has a recoverable Git baseline.
