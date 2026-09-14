# Contract 04 — `%` / `_` / `=` Timing

## Cell grid

4/4 only in P5.31:

- 1 cell/bar => 4 beats
- 2 cells/bar => 2 beats each
- 4 cells/bar => 1 beat each

Any 3-cell bar fails explicitly.

## `%`

- same chord identity as preceding chord;
- new attack;
- separate attack boundary;
- invalid with no prior chord.

## `_`

- silence;
- clock continues;
- no chord identity;
- no reference attack;
- no keyboard target while resting.

## `=`

- extend prior sounding chord;
- no new attack;
- may cross a bar line;
- invalid at score start;
- invalid after rest;
- exact duration must round-trip through Vault.

## Audio

Transport/reference scheduling must derive from the same canonical timeline as
visual playhead state. No second clock.
