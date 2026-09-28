# Toward 1.0

What 3.16 deliberately left undone, and why each piece matters in the field. None of
these is a defect; the app is correct without them. They are the difference between an
app that answers correctly and one that is usable at night, in gloves, with no signal.

Two shapes of use run through all of it, and they want different things from the same
app: sending a point to someone standing somewhere else, and planning a long route at a
desk to walk later.

## 1. Field mode

There is no dark theme. `:root` in `index.html` defines one palette — white ground,
near-black text — and there is no `prefers-color-scheme` anywhere. On a night march that
is a torch pointed at your own face.

Touch targets are already done: a `@media (pointer:coarse)` block puts every control at
44 px on a touch screen while the compact 34 px sizes stay under a mouse. What is left —
dark ground and larger readout type — belongs with it as one coherent piece rather than
three separate changes.

## 2. A per-point share

What actually crosses the gap between two people is a reference read aloud, typed into a
message, or a GPX. Copy gives you the digits while the grid name stays in a dropdown on
your own screen, and a grid reference without its grid is the oldest error in the book.

One line carrying grid, full reference and datum would remove a whole class of mistake.
It is small, and it is the highest-value item here.

## 3. Visible offline coverage

The service worker caches tiles as they are seen — 1,400 of them, shared across layers —
so your coverage is whatever you happened to pan over, and there is no way to tell what
you have before you lose signal.

[docs/offline-maps.md](offline-maps.md) already scopes the provider and storage side.
What is missing in the app is a readout of what is actually held and a deliberate "keep
this area".

## 4. Budgets shown before the wall, not at it

Every limit is announced at the moment you hit it: 20,000 points in the Point Picker,
2,000 in the converter table, 2,000 to send between tabs, 20 MB per GPX, 1,400 cached
tiles. Someone who has just plotted a four-day route finds out about the 2,000 limit when
*Send to converter* refuses.

Show the budget once a list gets large.

## 5. A first-run pass

Nothing currently explains what a reference area is, and it is the concept every
confusing message in the app depends on.

---

## Notes for whoever runs the tests

- `node --test tests/converter.test.cjs` sometimes reports all its tests and then never
  exits — a jsdom teardown issue, worse when stray browser processes are alive. Piping
  its output through `grep` deadlocks it reliably. Redirect to a file and count the pass
  and fail lines instead of waiting for the summary.
- The double-tap zoom loop in `tests/field-browser.cjs` uses fixed waits around
  `touchscreen.tap` and has failed about once in a dozen runs. Re-run before
  investigating.
- Three refs under `.git/refs/codex/turn-diffs/checkpoints/` point at trees rather than
  commits, so `git for-each-ref` warns about them. They are Codex's turn-diff restore
  history and are left in place deliberately; deleting them costs the ability to roll
  back those turns.
