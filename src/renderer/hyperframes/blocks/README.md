# Local HyperFrames Blocks

This folder is a local mirror of the official HyperFrames registry:

https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry

Synced at: 2026-05-02T10:16:02.181Z

Counts:

- Blocks: 43
- Components: 3
- Examples: 8

Runtime layout:

- `*.html`: installable HyperFrames block compositions.
- `components/*.html`: reusable snippets/components.
- `assets/**`: media required by block compositions.
- `examples/**`: full registry examples for reference when designing templates. These are not copied into render temp folders.
- `_registry/**`: registry metadata and item manifests.

Re-sync:

```bash
npm run hyperframes:sync-blocks
```
