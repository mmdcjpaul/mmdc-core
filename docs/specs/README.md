# Implementation specifications

This directory decomposes [`IMPLEMENTATION_PLAN.md`](../../IMPLEMENTATION_PLAN.md) into ordered, independently verifiable tickets.

## Layout

Each ticket has its own directory:

```text
docs/specs/Fnn-Tnn-short-name/SPEC.md
```

[`tracker.md`](tracker.md) is the plan of record. Ticket order in the tracker is build order. A ticket may start only after every ticket in its `Depends on` column is `Done`.

## EARS convention

Every normative requirement uses one of these Easy Approach to Requirements Syntax (EARS) patterns:

- Ubiquitous: `The <system> SHALL <response>.`
- Event-driven: `WHEN <trigger>, the <system> SHALL <response>.`
- State-driven: `WHILE <state>, the <system> SHALL <response>.`
- Optional feature: `WHERE <feature is selected>, the <system> SHALL <response>.`
- Unwanted behavior: `IF <condition>, THEN the <system> SHALL <response>.`
- Prohibition: `The <system> SHALL NOT <prohibited behavior>.`

`SHALL` and `SHALL NOT` are binding. Notes, rationale, and implementation hints are not substitutes for a requirement.

## Validation contract

Run structural validation at any time:

```bash
./validation.sh --specs
```

Validate an implemented ticket with:

```bash
./validation.sh F01-T01
```

Task validation first checks the tracker/spec structure, then executes `tests/acceptance/<ticket>.sh`. That acceptance script is delivered with the implementation and must encode every acceptance criterion in the ticket. Exit code `0` means the ticket passed; any other code means it is incomplete or failed. Missing acceptance scripts always fail.

Acceptance scripts must be deterministic, non-interactive, safe to repeat, and must not mutate shared or production infrastructure. Evidence that requires a human or external system must be checked as a committed, sanitized evidence record; it must never be fabricated by the autonomous loop.

## Status ownership

`loop.sh` owns tracker status transitions. An implementation agent may inspect the tracker, but it must not mark its own ticket `Done`. The loop marks a ticket `Done` only after `./validation.sh <ticket>` exits `0`.
