# Offline catalog extraction

These tools read installed Unity assets and write inspection material only under
the ignored repository `.local-game/` directory. They never launch the game,
read player saves, call native game methods, or modify the installation.

The reviewed source is **Idle Slayer 7.2.0**, Steam app **1353300**, build
**25551532**, Unity **6000.3.14f1**, IL2CPP metadata **39**. UnityPy 1.25.4 reads
the built-in asset types. Custom type trees are stripped. Direct
TypeTreeGeneratorAPI 0.0.10 IL2CPP loading cannot interpret this metadata version;
use the dummy assemblies from the [offline logic pipeline](../logic/README.md).

Run from the repository in Windows PowerShell, using Python 3.10 or newer:

```powershell
python -m venv .local-game\extract-venv
.\.local-game\extract-venv\Scripts\python.exe -m pip install -r scripts\extract\requirements.txt
# Run scripts/logic pipeline first, producing .local-game/logic/dummy.
$gameInputPath = 'F:\SteamLibrary\steamapps\common\Idle Slayer'
$steamManifestPath = 'F:\SteamLibrary\steamapps\appmanifest_1353300.acf'
.\.local-game\extract-venv\Scripts\python.exe scripts\extract\extract_assets.py --game-root $gameInputPath --manifest $steamManifestPath --dummy-assemblies .local-game\logic\dummy --output .local-game\asset-export
.\.local-game\extract-venv\Scripts\python.exe scripts\extract\review_icons.py --export .local-game\asset-export\asset-export.json --output .local-game\sprite-review
.\.local-game\extract-venv\Scripts\python.exe scripts\extract\normalize_catalog.py --export .local-game\asset-export\asset-export.json --output .local-game\catalog-candidate.json
```

The installation path is an example; pass the actual Steam library or a copied
input folder. Keep the manifest private: only app ID and build ID are exported.
Game paths, Steam account fields, gameplay timestamps, saves and credentials are
never written into provenance.

`extract_assets.py` compares every native `AscensionSkill` asset against the
`ResourceManager` entries under `ascension skills/`. Native
`PlayerInventory.Awake` loads exactly that resource path. This build has 288
unique upgrade IDs, 318 prerequisite connections, nine explicit external item
milestones and 288 referenced sprites. Costs remain decimal strings expanded
from the shortest round-trip representation of the serialized native double.
Coordinates preserve the native position without a layout substitution.

Generated MonoBehaviour root fields have an alignment problem in this toolchain;
the script uses the fixed native script pointer and discards generated base
fields. Every catalog custom field is read with full-length validation. Ancillary
description targets have only their leading ID/label read, avoiding unsupported
unrelated type trees. UnityPy's PlayerSettings tree misses four trailing bytes;
the earlier `bundleVersion` is read with that unrelated tail mismatch tolerated.

The English text is from the native `en-US` TextAsset. Descriptions use native
templates, serialized effect values and referenced labels. Unity rich-text tags
are converted to plain text. Native current totals and minion stats depend on
player state, which these tools never read: 14 descriptions show the static
effect and explicitly explain that current totals or stats vary. The mapping is
in `normalize_catalog.py`; native dynamic branches are recorded in the method
receipt. No incomplete wiki dependencies are substituted.

After visually inspecting all six numbered sprite sheets, mark
`visualReviewComplete` in the private `sprite-review-inventory.json` as true and
record the review evidence. Then normalize with the matching review inventory:

```powershell
.\.local-game\extract-venv\Scripts\python.exe scripts\extract\normalize_catalog.py --export .local-game\asset-export\asset-export.json --output .local-game\catalog-candidate.json --sprite-review .local-game\sprite-review\sprite-review-inventory.json
```

External milestone controls use an explicit app policy: show a control when a
consuming branch is reachable through its ordinary purchase prerequisites, or
the consuming upgrade is already owned, while retaining other native reveal
gates. Exclude the milestone itself from the control's predicate. This prevents
both checklist spoilers and a self-deadlock when entering existing progress.
Isolated branch entry nodes with no ordinary tree prerequisites expose a
control only once that consuming node is already owned. Use **Show spoilers**
for first entry of those milestones; no guessed story or Ultra gate is used.
It does not redefine the game's purchase or reveal rules for upgrades.

Once the candidate and icons are promoted locally, regenerate the sanitized
receipt against the exact final catalog and final icon bytes:

```powershell
.\.local-game\extract-venv\Scripts\python.exe scripts\extract\write_coverage_receipt.py --export .local-game\asset-export\asset-export.json --catalog public\catalog.json --sprite-review .local-game\sprite-review\sprite-review-inventory.json --icons public\assets\upgrades --output data\catalog-receipt.json
```

The committed receipt records every native ID, resource path, position, decimal
cost, prerequisite and relevant serialized flag, along with the final catalog
hash and all reviewed sprite hashes. CI can validate the committed static data
against this receipt without access to the game. Keep raw exports, dummy
assemblies, all game binaries and contact sheets private. Only the normalized
catalog, reviewed individual sprites, sanitized evidence and these tools may be
committed. Application code and game content attribution remain separate.
