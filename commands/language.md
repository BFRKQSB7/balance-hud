---
description: Toggle the HUD label language between English and 中文 (edits ~/.claude/plugins/balance-hud/config.json)
allowed-tools: Read, Write, Bash
---

# Toggle Balance HUD Language

Switch the HUD label language between **English** and **中文 (Chinese)**.

## Steps

1. Read `~/.claude/plugins/balance-hud/config.json`.
2. Check the `language` field:
   - `"zh-Hans"` → the HUD is currently Chinese. Set it to `"en"` (English).
   - `"en"` → the HUD is currently English. Set it to `"zh-Hans"` (中文).
   - Any other / missing value → set it to `"zh-Hans"`.
3. Write the file back, keeping every other key unchanged. Use a real JSON serializer (not manual string concatenation).
4. Confirm to the user which language the HUD now uses:

   > ✅ HUD 语言已切换为 **中文**（上下文 / 缓存效果 / 用量…）

   or

   > ✅ HUD language switched to **English**.

The HUD refreshes automatically on every statusline poll (~300ms) — no restart needed. Labels affected include Context → 上下文, Cache Effect → 缓存效果, Usage → 用量, Tokens → 词元.
