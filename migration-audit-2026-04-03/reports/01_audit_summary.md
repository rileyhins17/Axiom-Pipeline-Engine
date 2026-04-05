# File System Audit Summary

Audit date: 2026-04-03
Scope: user-accessible data only. No deletions performed. No user content moved during this phase.

## Meaningful landscape

- `C:\Users\riley\Axiom` is a clear active business/work root. It currently contains an active repo for `the-omniscient-axiom-launcher`.
- `C:\Users\riley\Documents\GitHub` and `C:\Users\riley\Documents\New project` contain additional Axiom-related website and operations repos, plus likely duplicate working copies.
- `C:\Users\riley\OneDrive - Conestoga College` is the strongest current school workspace. It contains active assignment folders and recent SolidWorks / PLC deliverables modified on 2026-04-03.
- `C:\Users\riley\Desktop\School` contains older school material plus a large `AutoCAD 2026` software payload that should not be treated like normal school documents.
- `C:\Users\riley\Downloads` is a mixed intake zone with current course PDFs, CAD parts, cover letters, installers, archives, and duplicate versions.
- `C:\Users\riley\Documents` contains both true user content and heavy non-sync payloads:
  - `Virtual Machines` is very large and not a good Google Drive candidate.
  - `SOLIDWORKS Downloads` is installer media, not long-term academic knowledge.
  - `Playground`, `New project`, and `GitHub` are active code/project zones.
- `C:\Users\riley\Pictures\iPhone CAmera` appears to be personal media.
- `C:\Users\riley\Pictures\Screenshots` is mixed-context and should be reviewed, not bulk-classified blindly.
- `C:\Users\riley\My project` is a Unity project and should remain intact as a repo/project unit.

## Size summary

- `C:\Users\riley\Documents`: about 37.3 GB
- `C:\Users\riley\Pictures`: about 11.0 GB
- `C:\Users\riley\Downloads`: about 5.2 GB
- `C:\Users\riley\Desktop`: about 2.0 GB
- `C:\Users\riley\OneDrive - Conestoga College`: about 99 MB
- `C:\Users\riley\Axiom`: about 3.8 MB

## Primary conclusions

- The machine already has strong domain anchors for `School` and `Axiom`.
- The biggest migration risk is not misplacing active school/business work. The second biggest risk is accidentally syncing heavy software payloads, installers, virtual machines, or sensitive secrets into Google Drive.
- Folder-level preservation is the right strategy for repos, coursework bundles, and assignment folders.
- A dry-run move plan is safe to prepare now. Actual relocation of user content should start with high-confidence clusters only.

