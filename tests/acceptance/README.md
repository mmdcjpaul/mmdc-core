# Ticket acceptance scripts

Each implemented ticket adds an executable `Fnn-Tnn.sh` here. The script must test every acceptance criterion in its matching `docs/specs/*/SPEC.md` and return nonzero on any unmet criterion.

Acceptance scripts are implementation deliverables, not pre-passing placeholders. `validation.sh` deliberately fails a ticket whose acceptance script does not yet exist.
