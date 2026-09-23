# Stop Boundaries

## P5.40-00 STOP

Stop after:

- independent local ground truth is frozen;
- all current candidates are scored and ranked;
- score breakdown is complete;
- failure mechanism is classified;
- generalization evidence is recorded;
- no correction has been implemented.

Do not begin P5.40-01 without separate authorization.

## P5.40-01 STOP

If separately authorized, Stage01 may implement one generalized Shadow correction only after Stage00 diagnosis. Stop after focused Shadow validation. No private promotion evaluation unless separately authorized.

## P5.40-02 STOP

Stop after broad Shadow safety evaluation. Do not integrate production.

## P5.40-03 STOP

Stop after an explicit `PROMOTION = PASS` or `PROMOTION = FAIL`.

`FAIL` means no retune in the same stage.

`PASS` still does not authorize Stage04 without separate approval.

## P5.40-04 STOP

Production integration, if ever authorized, must have its own parser/schema/persistence compatibility plan, migration decision, rollback path and full product acceptance.
