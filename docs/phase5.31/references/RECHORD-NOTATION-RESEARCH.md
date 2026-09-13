# ReChord notation research

Research date: 2026-09-13

## Primary current source

ReChord:
https://rechord.cc/

The current landing/editor page demonstrates:

```text
# 小節を | で区切ってコードを入力します
C|G|A m7|E m7

F|E m7 A m7|D m7|G 7

# 行頭に # を入力するとメモが書けます
F M7|G 7

# % で連打、 _ で休符、 = で直前のコードを伸ばします
E 7%_A m7|=G

# / でオンコード(最低音)を指定できます
F C/E|D m7 D m7/G

C add9
```

Facts used by P5.31:

- `|`: measure separator
- leading `#`: memo/comment
- `%`: repeated strike
- `_`: rest
- `=`: extend previous chord
- `/`: on-chord / lowest-note specification
- root and chord type may include whitespace

ReChord exposes Key, Beat, BPM, and Capo as separate editor controls. P5.31 does
not infer those fields from score text.

## Secondary historical implementation source

Author article:
https://qiita.com/comorebi_notes/items/c8b4dde0f6bd91666a5c/

This article explains the author's `chord-translator` approach and documents
historical support/intent for:

- multiple equivalent major-7 spellings (`M`, `maj`, `△`, `Δ`);
- minor;
- augmented;
- half-diminished symbols;
- altered fifth spellings;
- 6/7/9/11/13;
- sus2/sus4;
- add2/add4/add6/add9/add11/add13;
- dim/o;
- comma-separated tension lists inside parentheses;
- `omitN`.

Important: this article is historical evidence, **not** a guarantee that every
old alias is still current ReChord behavior. P5.31 must test the existing Loop
Vault parser and add only unambiguous compatibility needed for current score
input and accepted fixtures.

In particular, historical `C#5`-as-augmented syntax is ambiguous in a general
text parser. Do not silently adopt it.

## Repository

Public ReChord repository:
https://github.com/comorebi-notes/rechord

P5.31 does not vendor/copy ReChord source code or parser code. The implementation
must remain Loop Vault-owned and use Loop Vault's existing chord identity parser.
