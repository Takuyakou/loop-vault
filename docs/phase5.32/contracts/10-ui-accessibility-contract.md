# Contract 10 — UI / Accessibility

Required visible text:
- Current LEFT HAND / RIGHT HAND blocks where present;
- per-hand PITCH, CHORD TONE, and optional FINGER;
- compact Next-hand pitch/finger preparation;
- `おすすめ`
- hand R/L
- keyboard finger labels

Finger information cannot rely on color alone.

Keyboard must expose accessible names describing:
- hand;
- note;
- finger.

The normal workspace does not expose persistent finger-number selects. The
運指を編集 / Edit fingering dialog separates LH and RH and provides Save,
Reset to suggestion, and Cancel with focus trapping and Escape close.

At 320px / 200%:
- no page-level horizontal overflow caused by fingering UI;
- the 61-key keyboard and timeline may scroll only inside their own regions.

Reduced motion does not affect functional playhead position.
