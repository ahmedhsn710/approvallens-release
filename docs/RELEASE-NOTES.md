# ApprovalLens 0.7.1 — automatic project inventory

Rule suggestions now inventory the project automatically without a file picker. Hidden, generated, symlinked and likely sensitive paths are excluded. The preview shows exactly what will be sent; contents are never uploaded. Up to 800 paths and 30 KB of inventory are supported; oversized scans fail explicitly instead of silently truncating. Suggested permissions remain minimal and unapplied.

The website documents every extension command and includes an accessible SVG state diagram with approval, denial, review failure and state-change branches.
