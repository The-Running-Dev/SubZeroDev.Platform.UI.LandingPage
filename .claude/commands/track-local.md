## vocabulary

This repository numbers slices `UI<n>` and criteria `UI<n>.<m>`, not `S<n>` / `S<n>.<m>`
(`design/30-slices.md`, "How this document is kept"). Wherever the core `track.md` or its
worked examples say `S<n>`, read `UI<n>` for this repository — issue titles begin `UI<n> —`,
not `S<n> —`; agent-block pins read `§ UI<n> @ <sha>`, not `§ S<n> @ <sha>`.

`tools/Test-DesignDrift.ps1` accepts a `-SlicePrefix` parameter for exactly this. Invoke it as:

```powershell
pwsh ./tools/Test-DesignDrift.ps1 -SlicePrefix UI
```

Calling it with no `-SlicePrefix` silently compares zero slices — the flag is not optional in
this repository, it is the fix for the gap tracked in issue #20.
