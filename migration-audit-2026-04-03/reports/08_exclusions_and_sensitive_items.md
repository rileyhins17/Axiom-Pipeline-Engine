# Exclusions And Sensitive Items

## Exclude from normal Google Drive sync

- software installers and install trees
- VM disk files and virtual machine bundles
- portable application folders
- repo internals such as `.git`, `node_modules`, `.next`, caches, and build artifacts when staging repos

## Sensitive items requiring extra caution

- `C:\Users\riley\Documents\Chrome Passwords.csv`
  - credential export
  - recommendation: do not place in Google Drive without explicit approval and encryption strategy

- `C:\Users\riley\Pictures\Screenshots\metamask recovery phrase.png`
  - crypto seed / wallet recovery content
  - recommendation: do not sync to Google Drive; move only through a manual secure-handling workflow

## Operational rule

- treat sensitive exports as `hold in place` or `manual secure review`, not routine migration content

