# Contract 03 — Bounded Chord Grammar

## Goal

Expand representability without allowing arbitrary pitch sets to become arbitrary
verbose symbols.

## Required audit first

P5.39-00 must map current:
- quality enum/templates;
- parser/formatter;
- factorization/identity helpers;
- candidate generator;
- canonical comparison;
- slash-bass handling;
- serialization/text consumers.

The exact grammar is not preselected by this package.

## Expected dimensions

A viable model may factor identity into bounded dimensions such as:
- root;
- base quality / third/sus family;
- seventh family;
- extension family (9/11/13 where justified);
- explicit alterations (`b5/#5/b9/#9/#11/b13`, current conventions);
- explicit omissions (`no3/no5`, only where necessary/meaningful);
- slash bass.

This is a design space, not permission to emit every combination.

## Candidate-count bound

No powerset enumeration of modifiers.
Document the maximum number of identity candidates considered per root/window and
lock a stress test.

## Observed-evidence rule

Explicit alterations/omissions must be justified by the represented pitch-class
identity, not invented to improve score.
