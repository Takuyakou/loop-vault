# P13 subsection 3 — Playback and recording

Absolute audio origin schedules source bass, optional electric-piano accompaniment and the shared metronome preference. The source window is1/2/4/8/all bars at60/80/100%. Long overview rendering is bounded to128 bins, while start-bar entry retains access to every bar. Existing DegreeFretboard handles raw notes without changing saved pitches.

The existing opt-in recorder, input device/channel, codec negotiation, mono capture graph, local take player and explicit Keep storage are reused. MIDI alone observes automatic window completion after one-bar count-in. Capture never contains app-side audio mixing. Input level reads the existing routed stream. Manual cancel/unmount invalidates pending callbacks and does not analyze or save an attempt.

Audio-origin lookahead is included in automatic stop and software-offset subtraction. Overlay prepares the source instrument first and aligns its origin to the take's capture offset; stale asynchronous starts are guarded. Legacy take playback remains synchronous when no delay is requested. Saved takes can be recorded again without deleting the retained take.

Recording limit is60 seconds including scheduling margin; windows longer than59.8 seconds require shortening or increased tempo. Focused fake-clock tests cover count-in, the final scheduling margin, exactly-once completion and cancellation. Browser E2E drives real WebAudio routing, MediaRecorder, decoding and worker analysis with public synthetic input.
