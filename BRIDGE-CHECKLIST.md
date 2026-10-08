# Linkkit + Boardkit side-by-side checklist

A hand check of the shared store with the real apps on the same site,
something every bridge step so far could only simulate. Takes about 20
minutes. Tick each box; when something doesn't match "Expect", write down
the step number and what you saw (a screenshot helps) and stop there.

Work only on the throwaway map and board made in step 3, both called
**ZZ bridge test**. Don't edit any real map or board.

## 0. Before you start

- [ ] **0.1** Open both apps in the same browser (Chrome or Edge, since
  automatic backup needs one of them), each in its own window side by side:
  https://gauntlet-home.vercel.app/linkkit and
  https://gauntlet-home.vercel.app/boardkit
- [ ] **0.2** Safety copies. Linkkit: map menu → **Export all maps**.
  Boardkit: **Export all boards…**. Keep both files somewhere safe until
  the end.
- [ ] **0.3** Write down whether automatic backup is already on in each
  app, so you can put it back the way it was in step 8.

## 1. Linkkit backup writes a file

- [ ] **1.1** Map menu → **Automatic backup…**. If it's already on, keep
  its folder. If not, choose a folder (a new empty one is easiest to
  check).
- [ ] **1.2** Make any small change to a throwaway map (or wait for step
  3, then come back), then wait about 15 seconds.
- [ ] **1.3** Open the folder in File Explorer.
  Expect: a new file `linkkit-backup-YYYY-MM-DD-HHMM.json` with the time
  you just made the change. The map menu says "Backing up to “…” · last
  … ago" with a matching time.
- [ ] **1.4** Open the file in Notepad and search for a map name you
  know. Expect: it's there.

## 2. Boardkit backup writes a file

- [ ] **2.1** Board menu → **Automatic backup…**. Same as 1.1.
- [ ] **2.2** Make a small change (after step 3, a change to ZZ bridge
  test is fine), then wait about 15 seconds.
- [ ] **2.3** Expect: a new `boardkit-backup-YYYY-MM-DD-HHMM.json` in
  that folder, and the menu's "Last backup" says just now.
- [ ] **2.4** Open it in Notepad and search for a board name. Expect:
  it's there.

## 3. Link a throwaway tree

- [ ] **3.1** Linkkit: **+ New map with tree rules**. Name the start box
  `ZZ bridge test`. Add two next steps, `List A` and `List B`, and give
  each two next steps (`A1`, `A2`, `B1`, `B2`).
- [ ] **3.2** Map menu → **Link to Boardkit…**.
  Expect: the question says it becomes a board with 2 lists and 4 cards.
  Click **Link**.
  Expect: a "Linked to Boardkit" chip in the header.
- [ ] **3.3** Click **Open in Boardkit** on the chip.
  Expect: Boardkit opens ZZ bridge test with List A and List B, cards in
  the same order as in Linkkit.
- [ ] **3.4** In Linkkit, hover card `A1`.
  Expect: no "+" (cards can't have next steps in Boardkit).

## 4. Edits cross over live

Keep both windows visible. Each change should show in the other window
within a second or two, without reloading.

- [ ] **4.1** Rename `A1` to `A1 renamed` in Boardkit. Expect: Linkkit
  shows it.
- [ ] **4.2** Rename `B1` to `B1 renamed` in Linkkit. Expect: Boardkit
  shows it.
- [ ] **4.3** In Boardkit, drag `A2` above `A1`. Expect: Linkkit shows A2
  first under List A.
- [ ] **4.4** In Linkkit, drag `B2` onto `List A`. Expect: Boardkit shows
  B2 in List A.
- [ ] **4.5** In Boardkit, move `B2` back to List B. Expect: Linkkit
  shows it under List B again.
- [ ] **4.6** In Linkkit, set `List B` to cut. Expect: Boardkit shows a
  cut badge on List B and its cards look faded.
- [ ] **4.7** In Boardkit, type a line into card `A1 renamed`'s pregame
  thots. Expect: Linkkit shows it as that box's note.

## 5. Deletes go to Boardkit's trash, and come back

- [ ] **5.1** In Linkkit, delete card `B1 renamed`. Expect: it's gone in
  Boardkit and listed in Boardkit's trash (**Recently deleted lists and
  cards**). Linkkit's **Recently deleted** offers "Open trash in
  Boardkit" rather than its own list.
- [ ] **5.2** Restore it from Boardkit's trash. Expect: it's back in
  Linkkit, in its old place under List B.
- [ ] **5.3** In Linkkit, delete `List B` (the branch). Expect: Boardkit's
  trash holds the list with its cards. Restore it in Boardkit. Expect: the
  list and both cards come back in Linkkit.
- [ ] **5.4** In Boardkit, delete card `A2`. Expect: it's gone in Linkkit.

## 6. Undo respects the other app

- [ ] **6.1** In Linkkit, rename `List A` to `List A 2`, then press
  Ctrl+Z. Expect: back to `List A` in both apps.
- [ ] **6.2** In Linkkit, rename `List A` to `List A 3`. Then in Boardkit
  rename the same list to `List A 4`. Back in Linkkit, press Ctrl+Z.
  Expect: refused, with a message like "Can't undo further: “List A 4” was
  changed in Boardkit or another tab". Both apps still show `List A 4`.

## 7. Backups after linked edits

- [ ] **7.1** Wait about 15 seconds after the last edit. Expect: a new
  file in each backup folder.
- [ ] **7.2** In the newest Linkkit file, search for `ZZ bridge test`.
  Expect: found. Search for `linkedBoard`. Expect: not found (backups hold
  linked maps as ordinary trees).
- [ ] **7.3** In the newest Boardkit file, search for `ZZ bridge test`.
  Expect: found.

## 8. Unlink and clean up

- [ ] **8.1** In Boardkit, open **Delete this board…** for ZZ bridge
  test. Expect: the question names the Linkkit map. Click **Cancel**.
- [ ] **8.2** In Linkkit, map menu → **Unlink from Boardkit…** → confirm.
  Expect: the chip is gone and the map is still there as an ordinary tree.
  Boardkit still has the board.
- [ ] **8.3** In Boardkit, delete the ZZ bridge test board.
- [ ] **8.4** In Linkkit, delete the ZZ bridge test map, then in
  **Recently deleted** → Deleted maps → **Delete for good** on it.
- [ ] **8.5** If automatic backup was off before (0.3), turn it off again
  (**Turn off automatic backup**). Delete any backup folder you made just
  for this test.
- [ ] **8.6** Check that your real maps and boards look as before. Keep
  the safety copies from 0.2 for a day or so.

## Report back

Tell Claude which steps passed and, for any that failed, the step number
and what you saw. The next step after this checklist is the design for
"Link to an existing board".
