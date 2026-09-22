# Contract 02 — Evidence Classification
| State | Meaning |
|---|---|
| CONFIRMED | reproducible current-code/test evidence uniquely supports the statement |
| USER-REPORTED | prior local/private observation not reproducible from tracked repo data |
| SUPPORTED-HYPOTHESIS | evidence supports a mechanism but does not uniquely prove causality |
| REJECTED-HYPOTHESIS | controlled experiment contradicts it |
| UNRESOLVED | confounded/insufficient |
| HISTORICAL | old implementation/report only |
| CONFLICT | current sources disagree |

Examples:
- B greatly reducing fragmentation supports meter as a fragmentation factor, not "meter caused everything".
- Bm7 still failing after stable isolation means identity error remains independent.
- D helping jitter but harming arpeggio hard negatives means tolerance is a trade-off, not a universal fix.

One private file cannot establish a globally safe threshold or architecture.
