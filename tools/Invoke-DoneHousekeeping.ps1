#Requires -Version 7.0
<#
.SYNOPSIS
    The mechanical half of /done (.claude/commands/done.md): switch to the default branch,
    prune stale remote-tracking refs, and report which local branches are safe to delete.

.DESCRIPTION
    Everything done.md does before its "Ask, once" step is a fact-gathering and
    non-destructive git sequence with no judgement call in it - is the tree dirty, what is
    the default branch, does the current branch have unmerged commits, which local branches
    does `--merged` confirm, and (cross-checked via `gh`) which of the rest merged by squash.
    That is exactly the kind of repeated, mechanical scan AGENTS.md's own model-work table
    calls out as not needing a model call at all, which is why /done is routed `haiku/low`
    rather than higher - this script removes even that call for the part that never needed
    judgement.

    Deletion is the one step this script will not decide on its own. Called with no
    -DeleteBranches, it only switches, prunes, and reports candidates - nothing is deleted.
    AGENTS.md's *Git and delivery* is explicit that deleting a branch is not carved out of
    the authorization rule, so the actual delete list has to come from the one-time chat
    approval done.md's "Ask, once" step gets - this script executes that approved list, it
    does not produce it.

.PARAMETER RepoRoot
    Repository to operate on. Defaults to the current directory.

.PARAMETER DefaultBranch
    Override the default branch instead of resolving it from `git remote show origin`.

.PARAMETER SkipPull
    Check out the default branch without pulling. For environments with no network access
    to the remote, or for testing against a local-only fixture.

.PARAMETER DeleteBranches
    Branch names to delete with `git branch -d` (never `-D`) after everything else has run.
    Only ever the branches named here - never inferred, never "everything --merged found."

.PARAMETER AutoStash
    Instead of stopping on a dirty tree, run `git stash push -u` and continue. The stash is
    never popped by this script - it is left on the stash list and reported back
    (StashRef), so the caller can restore it explicitly rather than having it silently
    reappear on whatever branch happens to be checked out next.

.EXAMPLE
    ./tools/Invoke-DoneHousekeeping.ps1
    Switch, prune, and report candidates. Deletes nothing.

.EXAMPLE
    ./tools/Invoke-DoneHousekeeping.ps1 -DeleteBranches 'feature/foo','fix/bar'
    Also delete these two branches, once approval for exactly this list has been given.
#>
[CmdletBinding()]
param(
    [string] $RepoRoot = (Get-Location).Path,
    [string] $DefaultBranch,
    [switch] $SkipPull,
    [string[]] $DeleteBranches = @(),
    [switch] $AutoStash
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# git status exits non-zero when the path is not a git repository at all, `git branch -d` on
# a refused delete, and `git pull` on a failed fetch are all *expected* non-zero exits this
# script reads as data rather than failure. On PowerShell 7.3+ that would otherwise become a
# terminating error under $ErrorActionPreference = 'Stop' before the exit code or stderr text
# could be read - same guard, same reason, as Test-WriteSurface.ps1.
$PSNativeCommandUseErrorActionPreference = $false

function Invoke-Git {
    param([string[]]$GitArgs, [string]$WorkingDir)
    $out = & git -C $WorkingDir @GitArgs 2>&1
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = ($out -join "`n") }
}

<#
    Wraps the `gh` cross-check at its own seam so tests can mock it without gh installed -
    same shape as Test-DesignDrift.ps1's Get-TrackerIssue around its own `gh` call. Returns
    $null when gh found nothing (not installed, not authenticated, no matching PR); the
    caller cannot tell those apart and does not need to - "no merged PR was found" covers all
    three the same way done.md's report already describes it.
#>
function Get-MergedPrUrl {
    param([Parameter(Mandatory)][string] $Branch, [Parameter(Mandatory)][string] $WorkingDir)

    # gh has no `-C`/working-directory flag (unlike git) - it resolves the repo from the
    # process's own cwd, same as the original script relied on implicitly.
    $prCheck = & gh pr list --state merged --head $Branch --json number,url 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $prCheck) { return $null }
    $parsed = @($prCheck | ConvertFrom-Json)
    if ($parsed.Count -eq 0) { return $null }
    $parsed[0].url
}

<#
    `git branch --merged` decorates the current branch with `* ` and, distinctly, any branch
    checked out in another worktree with `+ `. for-each-ref's own `--merged` filter produces
    the same reachability answer with no decoration at all, so there is nothing to strip and
    nothing for a worktree-checked-out branch to be mis-parsed as (`+ feature/foo` read as a
    literal branch name, which silently breaks both the `gh` cross-check and the `--merged`
    membership test used to gate deletion).
#>
function Get-MergedBranchName {
    param([Parameter(Mandatory)][string] $DefaultBranch, [Parameter(Mandatory)][string] $WorkingDir)

    $result = Invoke-Git -GitArgs @('for-each-ref', '--format=%(refname:short)', "--merged=$DefaultBranch", 'refs/heads') -WorkingDir $WorkingDir
    ,@(($result.Output -split "`n") | Where-Object { $_ -and $_ -ne $DefaultBranch })
}

<#
    `git branch -d` refuses a branch checked out in another worktree with an error naming the
    worktree's path - a different failure from "genuinely unmerged" and one with a different
    remedy (`git worktree remove <path>`, not a force delete). Matched case-insensitively on
    the stable substring rather than the full message, since only the path after it is used.
#>
function Get-WorktreeBlockingPath {
    param([Parameter(Mandatory)][string] $GitOutput)

    $match = [regex]::Match($GitOutput, "used by worktree at '(?<path>[^']+)'", 'IgnoreCase')
    if ($match.Success) { $match.Groups['path'].Value } else { $null }
}

function Invoke-DoneHousekeeping {
    param(
        [string] $RepoRoot = (Get-Location).Path,
        [string] $DefaultBranch,
        [switch] $SkipPull,
        [string[]] $DeleteBranches = @(),
        [switch] $AutoStash
    )

    if (-not (Test-Path -LiteralPath $RepoRoot)) {
        throw "RepoRoot '$RepoRoot' does not exist."
    }
    $repoRootResolved = (Resolve-Path -LiteralPath $RepoRoot).Path

    $stashed = $false
    $stashRef = $null

    $statusResult = Invoke-Git -GitArgs @('status', '--short') -WorkingDir $repoRootResolved
    if ($statusResult.Output.Trim()) {
        if (-not $AutoStash) {
            return [pscustomobject]@{
                Stopped        = $true
                Reason         = 'DirtyTree'
                Detail         = $statusResult.Output
                DefaultBranch  = $null
                Pulled         = $false
                PrunedCount    = 0
                Candidates     = @()
                Deleted        = @()
                Refused        = @()
                Stashed        = $false
                StashRef       = $null
            }
        }
        $stashResult = Invoke-Git -GitArgs @('stash', 'push', '-u', '-m', 'Invoke-DoneHousekeeping auto-stash') -WorkingDir $repoRootResolved
        if ($stashResult.ExitCode -ne 0) {
            throw "AutoStash was requested but 'git stash push -u' failed: $($stashResult.Output)"
        }
        $stashed = $true
        $stashRef = 'stash@{0}'
    }

    if (-not $DefaultBranch) {
        $remoteInfo = Invoke-Git -GitArgs @('remote', 'show', 'origin') -WorkingDir $repoRootResolved
        $headLine = ($remoteInfo.Output -split "`n") | Where-Object { $_ -match 'HEAD branch:\s*(\S+)' }
        if ($headLine -and $headLine -match 'HEAD branch:\s*(\S+)' -and $Matches[1] -ne '(unknown)') {
            $DefaultBranch = $Matches[1]
        } else {
            # '(unknown)' is a real git state, not merely an absent line - it means the
            # remote's own HEAD symref was never set (common on a hand-created bare repo;
            # GitHub always sets it). Either way there is no default to trust silently.
            throw "Could not resolve the default branch from 'git remote show origin' (reported '(unknown)' or no HEAD branch line). Pass -DefaultBranch explicitly."
        }
    }

    $currentBranch = (Invoke-Git -GitArgs @('branch', '--show-current') -WorkingDir $repoRootResolved).Output.Trim()

    if ($currentBranch -and $currentBranch -ne $DefaultBranch) {
        $unmerged = Invoke-Git -GitArgs @('log', "$DefaultBranch..HEAD", '--oneline') -WorkingDir $repoRootResolved
        if ($unmerged.Output.Trim()) {
            # Unmerged relative to a genuine three-dot merge check does not by itself mean
            # abandoned work - a squash-merged PR looks identical to git. Cross-check gh before
            # trusting this as a stop condition.
            $mergedPr = Get-MergedPrUrl -Branch $currentBranch -WorkingDir $repoRootResolved
            if (-not $mergedPr) {
                return [pscustomobject]@{
                    Stopped        = $true
                    Reason         = 'UnmergedCurrentBranch'
                    Detail         = "Branch '$currentBranch' has commits not on '$DefaultBranch' and no merged PR was found for it via gh."
                    DefaultBranch  = $DefaultBranch
                    Pulled         = $false
                    PrunedCount    = 0
                    Candidates     = @()
                    Deleted        = @()
                    Refused        = @()
                    Stashed        = $stashed
                    StashRef       = $stashRef
                }
            }
        }
    }

    Invoke-Git -GitArgs @('checkout', $DefaultBranch) -WorkingDir $repoRootResolved | Out-Null
    $pulled = $false
    if (-not $SkipPull) {
        $pullResult = Invoke-Git -GitArgs @('pull') -WorkingDir $repoRootResolved
        $pulled = ($pullResult.ExitCode -eq 0)
    }

    $pruneResult = Invoke-Git -GitArgs @('fetch', '--prune', 'origin') -WorkingDir $repoRootResolved
    $prunedLines = @(($pruneResult.Output -split "`n") | Where-Object { $_ -match '\[deleted\]' })

    $mergedBranches = Get-MergedBranchName -DefaultBranch $DefaultBranch -WorkingDir $repoRootResolved

    $candidates = [System.Collections.Generic.List[object]]::new()
    foreach ($branch in $mergedBranches) {
        $candidates.Add([pscustomobject]@{ Branch = $branch; MergedPr = (Get-MergedPrUrl -Branch $branch -WorkingDir $repoRootResolved) })
    }

    $deleted = [System.Collections.Generic.List[object]]::new()
    $refused = [System.Collections.Generic.List[object]]::new()
    foreach ($branch in $DeleteBranches) {
        if ($mergedBranches -notcontains $branch) {
            $refused.Add([pscustomobject]@{ Branch = $branch; Reason = 'NotMerged'; Detail = "Not in --merged '$DefaultBranch' - not deleted." })
            continue
        }
        $deleteResult = Invoke-Git -GitArgs @('branch', '-d', $branch) -WorkingDir $repoRootResolved
        if ($deleteResult.ExitCode -eq 0) {
            $deleted.Add($branch)
            continue
        }
        $worktreePath = Get-WorktreeBlockingPath -GitOutput $deleteResult.Output
        if ($worktreePath) {
            $refused.Add([pscustomobject]@{
                    Branch = $branch
                    Reason = 'CheckedOutInWorktree'
                    Detail = "Checked out in another worktree at '$worktreePath'. Remedy: 'git worktree remove `"$worktreePath`"', then retry the delete - not a force delete."
                })
        } else {
            $refused.Add([pscustomobject]@{ Branch = $branch; Reason = 'DeleteFailed'; Detail = $deleteResult.Output })
        }
    }

    [pscustomobject]@{
        Stopped        = $false
        Reason         = $null
        Detail         = $null
        DefaultBranch  = $DefaultBranch
        Pulled         = $pulled
        PrunedCount    = $prunedLines.Count
        Candidates     = $candidates
        Deleted        = @($deleted)
        Refused        = @($refused)
        Stashed        = $stashed
        StashRef       = $stashRef
    }
}

# Guarded so the tests can dot-source this instead - same structure as Test-Companion.ps1,
# Test-WriteSurface.ps1, and Test-DesignDrift.ps1, and for the same reason.
if ($MyInvocation.InvocationName -ne '.') {
    Invoke-DoneHousekeeping -RepoRoot $RepoRoot -DefaultBranch $DefaultBranch -SkipPull:$SkipPull -DeleteBranches $DeleteBranches -AutoStash:$AutoStash
}
