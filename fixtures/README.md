# Fixtures

`reference-resort.json` is the reference resort: one resort built by hand, with
a shore, piers, an island and nearly every object, kept as a saved world (the
placements, paths, rails, terrain, shore, elevation and land, but no guests,
money or clock). It starts as a fresh game would.

`pnpm sim:report`, `pnpm bench --plot reference` and the tests that pin numbers
to one plot run on it. A generated plot is redrawn by every model added to the
catalogue; this one only moves when somebody edits it.

## Refreshing it

1. Build or change the resort in the game and save it.
2. Export the save from the DevTools console of the game's tab, with `NAME` the
   save's slot name or `null` for the latest, and keep the download as
   `fixtures/source/reference-save.json` (ignored by git; only the world is
   committed):

   ```js
   (async (NAME = null) => {
     const db = await new Promise((ok, no) => {
       const r = indexedDB.open('vox-resort');
       r.onsuccess = () => ok(r.result);
       r.onerror = () => no(r.error);
     });
     const all = (store) =>
       new Promise((ok) => {
         const r = db.transaction(store).objectStore(store).getAll();
         r.onsuccess = () => ok(r.result);
       });
     const metas = (await all('meta')).sort((a, b) => b.savedAt - a.savedAt);
     const meta =
       NAME === null ? metas[0] : metas.find((m) => m.name === NAME || m.resortName === NAME);
     const row = (await all('snapshots')).find((s) => s.id === meta.id);
     const json = JSON.stringify(row.snapshot, (_, v) =>
       ArrayBuffer.isView(v) ? Array.from(v) : v,
     );
     Object.assign(document.createElement('a'), {
       href: URL.createObjectURL(new Blob([json])),
       download: 'reference-save.json',
     }).click();
   })(null);
   ```

3. `pnpm fixture:refresh`
4. `pnpm test`, then re-measure the numbers pinned to it and `pnpm sim:report`.

`referenceResort.test.ts` fails when a model changes size, as the fixture still
holds the old footprint: re-export, or edit the placement by hand. It also fails
when a new model is neither on the resort nor on its `NOT_IN_REFERENCE` list.
