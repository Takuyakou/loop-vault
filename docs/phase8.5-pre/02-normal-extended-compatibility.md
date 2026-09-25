# P8.5-PRE-02 — Standard / extended compatibility

Current standard-v1 means the Git HEAD text intake behavior. Extended-v1 is a proposed document dialect; its table entries are design contracts, not implemented functionality.

| Feature | standard-v1 now | extended-v1 contract | Same semantic core? |
| --- | --- | --- | --- |
| ASCII `|` | accepted; 1/2/4 slots in 4/4 | accepted with explicit meter/rhythm bounds | yes for bar structure, separate timing policy |
| `%` | accepted when predecessor exists | re-attack predecessor | yes |
| `_` | accepted silence | accepted silence | yes |
| `=` | accepted hold after sounding event | accepted hold | yes |
| Line-leading `#` | comment masked with source offsets | comment retained in raw document | yes |
| Slash bass | shared `parseChordLabel`; `6/9` remains quality | same chord identity and bass | yes |
| Compact adjacency | bounded complete segmentation | same uniqueness requirement | yes |
| Internal root/type space | accepted in some unambiguous positions | source-mapped normalization | yes |
| `N.C.` | diagnostic | explicit silence if exact timing supported | shared silence event model |
| Full-width delimiters / accidental | not generally normalized | explicit finite alias map | shared normalized lexer output |
| `on` bass | not a standard parser suffix | alias to semantic slash bass if unique | yes, after lexical normalization |
| `<` / `>` playback markers | diagnostic | structure retained, optional playback range | document layer only |
| Bracket/label header | diagnostic | diagnostic pending evidence | document layer only |
| Key/BPM/capo/meter inside text | not supported | not inferred; separate fields | shared metadata model |
| Empty input | `empty-input` diagnostic | `EMPTY`/`IDLE`, no error | editor-state adapter |
| Source text after save | canonical events only | exact pasted text preservation needed | persistence gap |

`standard-v1` and `extended-v1` must not have two independent chord meaning implementations. A shared lexical result feeds one semantic chord parser; a dialect adapter adds structural rules and a timing policy. The same normalized chord should yield the same root, quality, extensions, omissions, slash bass, and pitch classes in both dialects. If this cannot be guaranteed, conversion fails with a semantic diagnostic.

Historical P5.20 prose lists `%` as rejected; the current implementation accepts it. This matrix follows current code. `N.C.` is different from `_` only at the lexical layer once the extended silence policy is implemented.

Compatibility testing must cover old valid standard text byte-for-byte and event-for-event, old invalid text remaining diagnostic, and extended forms that trigger only a hint in standard mode. No automatic dialect switch, partial save, or source MIDI provenance for text-generated voicing.
