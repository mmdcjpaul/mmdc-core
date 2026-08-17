# mmdc-core

The implementation program starts in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and is decomposed into EARS tickets in [`docs/specs/tracker.md`](docs/specs/tracker.md).

```bash
./validation.sh --specs
MAX_TICKETS=1 ./loop.sh <codex-model> <reasoning-effort>
```

See [`LOOP.md`](LOOP.md) for the autonomous loop contract and safeguards.
