#Requires -Version 7.0
#Requires -Modules Pester

<#
  Invoke-DoneHousekeeping.ps1 exits the process on none of its paths (it always just returns
  a result object), but it is still guarded on $MyInvocation.InvocationName so these tests can
  dot-source it and call Invoke-DoneHousekeeping directly - same structure as
  Test-Companion.ps1, Test-WriteSurface.ps1, and Test-DesignDrift.ps1.

  The seam this script actually has is git itself - decoration on `branch --merged`, and the
  distinct failure text `branch -d` gives for a worktree lock versus a genuine unmerged
  branch. A mock of git would test nothing about that, so the fixtures below are real
  repositories (and, for the worktree cases, real second worktrees) built under $TestDrive -
  same reasoning as Test-Companion.Tests.ps1 using real directories rather than mocked reads.
  Only Get-MergedPrUrl is mocked: it is the one true external boundary (gh, which may not be
  installed or authenticated in CI), same as Test-DesignDrift.Tests.ps1 mocks Get-TrackerIssue
  around its own `gh` call rather than `gh` itself.
#>

BeforeAll {
    $script:ScriptPath = Join-Path $PSScriptRoot 'Invoke-DoneHousekeeping.ps1'
    $script:PreDotSourceErrorActionPreference = $ErrorActionPreference
    . $script:ScriptPath

    function Invoke-GitFixture {
        param([Parameter(Mandatory)][string] $Repo, [Parameter(Mandatory)][string[]] $GitArgs)
        $out = & git -C $Repo @GitArgs 2>&1
        if ($LASTEXITCODE -ne 0) { throw "git $($GitArgs -join ' ') failed in fixture setup: $out" }
        , @($out)
    }

    # `git init` alone does not guarantee the initial branch is named 'main' - it follows
    # whatever init.defaultBranch the running machine has configured, or 'master' if unset.
    # Pointing HEAD at refs/heads/main before the first commit sidesteps that entirely, without
    # depending on `git init -b` support.
    function New-GitRepo {
        param([Parameter(Mandatory)][string] $Name)
        $repo = Join-Path $TestDrive $Name
        New-Item -ItemType Directory -Path $repo -Force | Out-Null
        Invoke-GitFixture -Repo $repo -GitArgs @('init') | Out-Null
        Invoke-GitFixture -Repo $repo -GitArgs @('symbolic-ref', 'HEAD', 'refs/heads/main') | Out-Null
        Invoke-GitFixture -Repo $repo -GitArgs @('config', 'user.email', 'fixture@example.com') | Out-Null
        Invoke-GitFixture -Repo $repo -GitArgs @('config', 'user.name', 'Fixture') | Out-Null
        Invoke-GitFixture -Repo $repo -GitArgs @('config', 'commit.gpgsign', 'false') | Out-Null
        Set-Content -LiteralPath (Join-Path $repo 'README.md') -Value 'root' -Encoding utf8
        Invoke-GitFixture -Repo $repo -GitArgs @('add', '.') | Out-Null
        Invoke-GitFixture -Repo $repo -GitArgs @('commit', '-m', 'initial') | Out-Null
        $repo
    }

    # Branches, commits, and merges the branch into main with a real merge commit (--no-ff, so
    # it never fast-forwards away and main always genuinely diverges first) - the shape that
    # exercises --merged / for-each-ref --merged the same way an actual finished feature branch
    # does.
    function New-MergedBranch {
        param([Parameter(Mandatory)][string] $Repo, [Parameter(Mandatory)][string] $BranchName)
        Invoke-GitFixture -Repo $Repo -GitArgs @('checkout', '-b', $BranchName) | Out-Null
        # The branch name (e.g. 'feature/a') is not a safe filename as-is - '/' would be read
        # as a directory separator on every OS this runs on.
        $fileSafeName = $BranchName -replace '[/\\]', '-'
        Set-Content -LiteralPath (Join-Path $Repo "$fileSafeName.txt") -Value 'x' -Encoding utf8
        Invoke-GitFixture -Repo $Repo -GitArgs @('add', '.') | Out-Null
        Invoke-GitFixture -Repo $Repo -GitArgs @('commit', '-m', "add $BranchName") | Out-Null
        Invoke-GitFixture -Repo $Repo -GitArgs @('checkout', 'main') | Out-Null
        Invoke-GitFixture -Repo $Repo -GitArgs @('merge', '--no-ff', $BranchName, '-m', "merge $BranchName") | Out-Null
    }

    function Add-FixtureWorktree {
        param([Parameter(Mandatory)][string] $Repo, [Parameter(Mandatory)][string] $Branch, [Parameter(Mandatory)][string] $Path)
        Invoke-GitFixture -Repo $Repo -GitArgs @('worktree', 'add', $Path, $Branch) | Out-Null
    }
}

AfterAll {
    $ErrorActionPreference = $script:PreDotSourceErrorActionPreference
    Set-StrictMode -Off
}

Describe 'Get-MergedBranchName — real git, the actual bug' {

    It 'a branch checked out in another worktree comes back with no decoration at all' {
        # This is the reported failure reproduced directly: `git branch --merged main` prefixes
        # such a branch with '+ ', which the old TrimStart('*', ' ') left in place. for-each-ref
        # has no decoration to strip in the first place.
        $repo = New-GitRepo -Name 'worktree-decoration'
        New-MergedBranch -Repo $repo -BranchName 'feature/a'
        Add-FixtureWorktree -Repo $repo -Branch 'feature/a' -Path (Join-Path $TestDrive 'worktree-decoration-wt')

        # Confirms the raw git output really is decorated here, so the assertion below is
        # actually exercising the fix and not a fixture that never hit the bug.
        $raw = (Invoke-GitFixture -Repo $repo -GitArgs @('branch', '--merged', 'main')) -join "`n"
        $raw | Should -Match '\+ feature/a'

        $names = Get-MergedBranchName -DefaultBranch 'main' -WorkingDir $repo

        $names | Should -Contain 'feature/a'
        $names | Should -Not -Contain '+ feature/a'
        ($names | Where-Object { $_ -like '+*' }) | Should -BeNullOrEmpty
    }

    It 'the current branch (which --merged decorates with a bare *) is excluded, same as before' {
        $repo = New-GitRepo -Name 'current-branch-excluded'
        New-MergedBranch -Repo $repo -BranchName 'feature/b'

        $names = Get-MergedBranchName -DefaultBranch 'main' -WorkingDir $repo

        $names | Should -Contain 'feature/b'
        $names | Should -Not -Contain 'main'
    }
}

Describe 'Get-WorktreeBlockingPath' {

    It 'extracts the path from a real "used by worktree" refusal' {
        $repo = New-GitRepo -Name 'blocking-path'
        New-MergedBranch -Repo $repo -BranchName 'feature/c'
        $wtPath = Join-Path $TestDrive 'blocking-path-wt'
        Add-FixtureWorktree -Repo $repo -Branch 'feature/c' -Path $wtPath

        $deleteResult = Invoke-Git -GitArgs @('branch', '-d', 'feature/c') -WorkingDir $repo

        $deleteResult.ExitCode | Should -Not -Be 0
        $path = Get-WorktreeBlockingPath -GitOutput $deleteResult.Output
        $path | Should -Not -BeNullOrEmpty
        (Resolve-Path -LiteralPath $path).Path | Should -Be (Resolve-Path -LiteralPath $wtPath).Path
    }

    It 'returns null for an unrelated git failure' {
        Get-WorktreeBlockingPath -GitOutput "error: branch 'feature/x' not found" | Should -BeNullOrEmpty
    }

    It 'returns null for a genuinely-unmerged refusal, so it is never mistaken for a worktree lock' {
        Get-WorktreeBlockingPath -GitOutput "error: The branch 'feature/x' is not fully merged." | Should -BeNullOrEmpty
    }
}

Describe 'Invoke-DoneHousekeeping — worktree-checked-out branch end to end' {

    It 'is a Merged candidate, refused with CheckedOutInWorktree (not NotMerged), naming the worktree path' {
        $repo = New-GitRepo -Name 'e2e-worktree'
        New-MergedBranch -Repo $repo -BranchName 'feature/d'
        $wtPath = Join-Path $TestDrive 'e2e-worktree-wt'
        Add-FixtureWorktree -Repo $repo -Branch 'feature/d' -Path $wtPath
        Mock Get-MergedPrUrl { $null }

        $r = Invoke-DoneHousekeeping -RepoRoot $repo -DefaultBranch 'main' -SkipPull -DeleteBranches @('feature/d')

        $r.Stopped | Should -Be $false
        $r.Candidates.Branch | Should -Contain 'feature/d'
        $r.Deleted | Should -Not -Contain 'feature/d'
        $r.Refused.Count | Should -Be 1
        $r.Refused[0].Branch | Should -Be 'feature/d'
        $r.Refused[0].Reason | Should -Be 'CheckedOutInWorktree'
        $r.Refused[0].Detail | Should -Match ([regex]::Escape((Split-Path -Leaf $wtPath)))
        $r.Refused[0].Detail | Should -Not -Match "Not in --merged"
    }
}

Describe 'Invoke-DoneHousekeeping — happy path' {

    It 'switches to the default branch, reports a merged candidate with its gh PR, deletes an approved plain branch' {
        $repo = New-GitRepo -Name 'happy-path'
        New-MergedBranch -Repo $repo -BranchName 'feature/e'
        Mock Get-MergedPrUrl { 'https://github.com/example/repo/pull/1' }

        $r = Invoke-DoneHousekeeping -RepoRoot $repo -DefaultBranch 'main' -SkipPull -DeleteBranches @('feature/e')

        $r.Stopped | Should -Be $false
        $r.DefaultBranch | Should -Be 'main'
        (Invoke-GitFixture -Repo $repo -GitArgs @('branch', '--show-current')) -join '' | Should -Be 'main'
        ($r.Candidates | Where-Object Branch -eq 'feature/e').MergedPr | Should -Be 'https://github.com/example/repo/pull/1'
        $r.Deleted | Should -Contain 'feature/e'
        $r.Refused | Should -BeNullOrEmpty
    }

    It 'a branch name --merged never confirmed is refused as NotMerged, not attempted' {
        $repo = New-GitRepo -Name 'not-merged'
        Mock Get-MergedPrUrl { $null }

        $r = Invoke-DoneHousekeeping -RepoRoot $repo -DefaultBranch 'main' -SkipPull -DeleteBranches @('feature/never-existed')

        $r.Deleted | Should -BeNullOrEmpty
        $r.Refused[0].Branch | Should -Be 'feature/never-existed'
        $r.Refused[0].Reason | Should -Be 'NotMerged'
    }

    It 'reports no candidates and deletes nothing when nothing is merged' {
        $repo = New-GitRepo -Name 'no-candidates'
        Mock Get-MergedPrUrl { $null }

        $r = Invoke-DoneHousekeeping -RepoRoot $repo -DefaultBranch 'main' -SkipPull

        $r.Candidates | Should -BeNullOrEmpty
        $r.Deleted | Should -BeNullOrEmpty
        $r.Refused | Should -BeNullOrEmpty
    }
}

Describe 'Invoke-DoneHousekeeping — dirty tree' {

    It 'a dirty tree with no -AutoStash stops before anything else, Reason DirtyTree' {
        $repo = New-GitRepo -Name 'dirty-stop'
        Set-Content -LiteralPath (Join-Path $repo 'untracked.txt') -Value 'x' -Encoding utf8

        $r = Invoke-DoneHousekeeping -RepoRoot $repo -DefaultBranch 'main' -SkipPull

        $r.Stopped | Should -Be $true
        $r.Reason | Should -Be 'DirtyTree'
        $r.Stashed | Should -Be $false
    }

    It '-AutoStash stashes (never pops), reports StashRef, and continues to build candidates' {
        $repo = New-GitRepo -Name 'dirty-autostash'
        New-MergedBranch -Repo $repo -BranchName 'feature/f'
        Set-Content -LiteralPath (Join-Path $repo 'untracked.txt') -Value 'x' -Encoding utf8
        Mock Get-MergedPrUrl { $null }

        $r = Invoke-DoneHousekeeping -RepoRoot $repo -DefaultBranch 'main' -SkipPull -AutoStash

        $r.Stopped | Should -Be $false
        $r.Stashed | Should -Be $true
        $r.StashRef | Should -Be 'stash@{0}'
        $r.Candidates.Branch | Should -Contain 'feature/f'
        $stashList = Invoke-GitFixture -Repo $repo -GitArgs @('stash', 'list')
        ($stashList -join "`n") | Should -Match 'Invoke-DoneHousekeeping auto-stash'
    }
}

Describe 'Invoke-DoneHousekeeping — unmerged current branch' {

    It 'stops as UnmergedCurrentBranch when gh finds no merged PR for it' {
        $repo = New-GitRepo -Name 'unmerged-stop'
        Invoke-GitFixture -Repo $repo -GitArgs @('checkout', '-b', 'feature/g') | Out-Null
        Set-Content -LiteralPath (Join-Path $repo 'feature-g.txt') -Value 'x' -Encoding utf8
        Invoke-GitFixture -Repo $repo -GitArgs @('add', '.') | Out-Null
        Invoke-GitFixture -Repo $repo -GitArgs @('commit', '-m', 'unmerged work') | Out-Null
        Mock Get-MergedPrUrl { $null }

        $r = Invoke-DoneHousekeeping -RepoRoot $repo -DefaultBranch 'main' -SkipPull

        $r.Stopped | Should -Be $true
        $r.Reason | Should -Be 'UnmergedCurrentBranch'
        $r.Detail | Should -Match 'feature/g'
    }

    It 'a squash-merged current branch (gh confirms a merged PR) is not stopped on' {
        $repo = New-GitRepo -Name 'unmerged-squash-ok'
        Invoke-GitFixture -Repo $repo -GitArgs @('checkout', '-b', 'feature/h') | Out-Null
        Set-Content -LiteralPath (Join-Path $repo 'feature-h.txt') -Value 'x' -Encoding utf8
        Invoke-GitFixture -Repo $repo -GitArgs @('add', '.') | Out-Null
        Invoke-GitFixture -Repo $repo -GitArgs @('commit', '-m', 'squash-merged elsewhere') | Out-Null
        Mock Get-MergedPrUrl { 'https://github.com/example/repo/pull/2' }

        $r = Invoke-DoneHousekeeping -RepoRoot $repo -DefaultBranch 'main' -SkipPull

        $r.Stopped | Should -Be $false
        $r.DefaultBranch | Should -Be 'main'
    }
}
