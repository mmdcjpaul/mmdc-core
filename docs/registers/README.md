# Project register contract

The files in this directory are versioned, sanitized project controls. They
describe ownership and boundaries; they do not provision resources, grant
access, or contain secret values.

## Document schema

Each register has YAML frontmatter with these fields:

| Field | Meaning |
| --- | --- |
| `register` | Stable register identifier. |
| `version` | Version of the register contract, in `MAJOR.MINOR` form. |
| `status` | `Active` means the document is the current repository record. |
| `accountable_owner` | Role accountable for keeping the register accurate. |
| `last_reviewed` | Date of the last repository review in `YYYY-MM-DD` form. |
| `review_cadence` | Required review interval or triggering event. |

Every register also has `## Scope`, `## Accountable owner`, `## Records`, and
`## Change and review` sections. The records use explicit column headings and
use role names rather than unverified personal identities.

`Approved` is used only when a committed approval record names an approver and
date. A guarded decision that lacks that evidence is recorded as `Blocked`,
with its accountable owner and concrete gate. A blocked record is not a
silent default and does not claim that an external control is active.

Secret inventory entries contain secret names and handling metadata only. A
secret name, storage location class, or rotation rule is not a secret value.
