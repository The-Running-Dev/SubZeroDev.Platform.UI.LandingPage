#Requires -Version 7.0
#Requires -Modules Pester

<#
  Test-DesignDrift.ps1 exits the process on every path (0/1/2), which would kill the Pester
  runner if invoked with `&`. Same structure as Wait-PullRequestCheck.Tests.ps1: the script
  guards its exit-calling wrapper with `$MyInvocation.InvocationName -ne '.'`, so dot-sourcing
  defines its functions here and skips the wrapper. `Invoke-DriftCheck` is called directly and
  asserted on its returned result; `Get-DriftExitCode` is a pure state->code map tested alone.

  The two boundaries - the tracker and git - are mocked at their own functions rather than at
  `gh` and `git`, because both read a native *exit code* as their answer and a mock cannot set
  $LASTEXITCODE. Mocking the seam above them tests the comparison, which is what this script is.

  Every slices document is written into $TestDrive; none of these tests read the real one, so
  they do not start failing when a slice lands.
#>

BeforeAll {
    $script:ScriptPath = Join-Path $PSScriptRoot 'Test-DesignDrift.ps1'
    # The dot-source runs the script's own Set-StrictMode/$ErrorActionPreference in this scope.
    # Captured here and restored in the matching AfterAll so they do not leak into whichever
    # test file Pester runs next in the same invocation.
    $script:PreDotSourceErrorActionPreference = $ErrorActionPreference
    . $script:ScriptPath

    function New-SlicesDoc {
        param([Parameter(Mandatory)][string] $Content, [string] $Name = 'slices.md')
        $path = Join-Path $TestDrive $Name
        Set-Content -LiteralPath $path -Value $Content -Encoding utf8
        $path
    }

    function New-Issue {
        param([int] $Number, [string] $Title, [string] $Body)
        [pscustomobject]@{ number = $Number; title = $Title; state = 'OPEN'; body = $Body }
    }

    function New-Tracker {
        param([object[]] $Issues = @())
        [pscustomobject]@{ Issues = @($Issues); Failure = $null }
    }

    # One slice, two criteria - the shape every positive case starts from.
    $script:TwoCriterionDoc = @'
# Slices

## Outstanding

## S1 — A slice

Delivers: something a reader can follow.

Acceptance:
  - S1.1 The first criterion holds.
  - S1.2 The second criterion holds.
'@
}

AfterAll {
    $ErrorActionPreference = $script:PreDotSourceErrorActionPreference
    Set-StrictMode -Off
}

Describe 'Test-DesignDrift' {

    Context 'criterion ids' {

        It 'matching ids on both sides is Clean, exit 0' {
            $path = New-SlicesDoc -Content $script:TwoCriterionDoc
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'S1 — A slice' -Body "### Done when`n- [ ] **S1.1** first`n- [x] **S1.2** second"
            ) }

            $r = Invoke-DriftCheck -SlicesPath $path

            $r.State | Should -Be 'Clean'
            $r.Findings.Count | Should -Be 0
            $r.SlicesCompared | Should -Be 1
            Get-DriftExitCode -State $r.State | Should -Be 0
        }

        It 'reworded criteria with the same ids are not drift' {
            $path = New-SlicesDoc -Content $script:TwoCriterionDoc
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'S1 — A slice' -Body "- [ ] **S1.1** completely different wording here`n- [ ] **S1.2** and here too"
            ) }

            (Invoke-DriftCheck -SlicesPath $path).State | Should -Be 'Clean'
        }

        It 'an id in the doc but not the issue is reported as InDocNotIssue, exit 1' {
            $path = New-SlicesDoc -Content $script:TwoCriterionDoc
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'S1 — A slice' -Body '- [ ] **S1.1** first'
            ) }

            $r = Invoke-DriftCheck -SlicesPath $path

            $r.State | Should -Be 'Drifted'
            $r.Findings.Kind | Should -Contain 'InDocNotIssue'
            ($r.Findings | Where-Object Kind -eq 'InDocNotIssue').Detail | Should -Be 'S1.2'
            Get-DriftExitCode -State $r.State | Should -Be 1
        }

        It 'an id in the issue but not the doc - a renumber - is reported as InIssueNotDoc' {
            $path = New-SlicesDoc -Content $script:TwoCriterionDoc
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'S1 — A slice' -Body "- [ ] **S1.1** first`n- [x] **S1.7** a tick now pointing at something else"
            ) }

            $r = Invoke-DriftCheck -SlicesPath $path

            $r.State | Should -Be 'Drifted'
            ($r.Findings | Where-Object Kind -eq 'InIssueNotDoc').Detail | Should -Be 'S1.7'
        }

        It 'an id cited in prose outside a slice section is not counted as a criterion' {
            # The real document does exactly this in its Contract questions section, so a
            # whole-file regex would invent criteria that were never cut.
            $path = New-SlicesDoc -Content @'
# Slices

## Contract questions

None outstanding - zero checks yields NotEvaluated, exercised by S1.9, and the batch by S1.8.

## S1 — A slice

Acceptance:
  - S1.1 The only real criterion.
'@
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'S1 — A slice' -Body '- [ ] **S1.1** the only real criterion'
            ) }

            (Invoke-DriftCheck -SlicesPath $path).State | Should -Be 'Clean'
        }

        It 'a landed slice with no body is not reported as a removal' {
            $path = New-SlicesDoc -Content @'
# Slices

## Outstanding

None.

## Landed

| Slice | Name | Issue | Criteria | Body complete at |
|---|---|---|---|---|
| **S1** | A slice that landed | #9, closed | S1.1-S1.2 | `af610a6` |
'@
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'S1 — A slice that landed' -Body "- [x] **S1.1** first`n- [x] **S1.2** second"
            ) }

            $r = Invoke-DriftCheck -SlicesPath $path

            $r.State | Should -Be 'Clean'
            $r.Findings.Count | Should -Be 0
            $r.SlicesCompared | Should -Be 0
        }

        It 'a slice with no issue at all is reported rather than skipped' {
            $path = New-SlicesDoc -Content $script:TwoCriterionDoc
            Mock Get-TrackerIssue { New-Tracker }

            $r = Invoke-DriftCheck -SlicesPath $path

            $r.State | Should -Be 'Drifted'
            $r.Findings.Kind | Should -Contain 'NoIssue'
        }
    }

    Context 'slice prefix' {

        It 'defaults to S and finds nothing when the document uses a different prefix' {
            $path = New-SlicesDoc -Content @'
# Slices

## Outstanding

## UI1 — A slice

Acceptance:
  - UI1.1 The only criterion.
'@
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'UI1 — A slice' -Body '- [ ] **UI1.1** the only criterion'
            ) }

            $r = Invoke-DriftCheck -SlicesPath $path

            $r.State | Should -Be 'Clean'
            $r.SlicesCompared | Should -Be 0
        }

        It 'a matching -SlicePrefix finds the slice, matches ids, and is Clean' {
            $path = New-SlicesDoc -Content @'
# Slices

## Outstanding

## UI1 — A slice

Acceptance:
  - UI1.1 The only criterion.
'@
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'UI1 — A slice' -Body '- [ ] **UI1.1** the only criterion'
            ) }

            $r = Invoke-DriftCheck -SlicesPath $path -SlicePrefix 'UI'

            $r.State | Should -Be 'Clean'
            $r.SlicesCompared | Should -Be 1
        }

        It 'a matching -SlicePrefix still reports a real id mismatch as drift' {
            $path = New-SlicesDoc -Content @'
# Slices

## Outstanding

## UI1 — A slice

Acceptance:
  - UI1.1 The first criterion.
  - UI1.2 The second criterion.
'@
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'UI1 — A slice' -Body '- [ ] **UI1.1** first'
            ) }

            $r = Invoke-DriftCheck -SlicesPath $path -SlicePrefix 'UI'

            $r.State | Should -Be 'Drifted'
            ($r.Findings | Where-Object Kind -eq 'InDocNotIssue').Detail | Should -Be 'UI1.2'
        }

        It 'a pin using the configured prefix resolves ancestry the same as S does' {
            $path = New-SlicesDoc -Content @'
# Slices

## Outstanding

## UI1 — A slice

Acceptance:
  - UI1.1 The only criterion.
'@
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'UI1 — A slice' `
                    -Body "- [ ] **UI1.1** first`n<!-- agent:start -->`nScope and criteria: ``design/30-slices.md`` § UI1 @ ``deadbee```n<!-- agent:end -->"
            ) }
            Mock Test-CommitIsAncestor { 'NotAncestor' }

            $r = Invoke-DriftCheck -SlicesPath $path -SlicePrefix 'UI'

            ($r.Findings | Where-Object Kind -eq 'PinNotAncestor').Slice | Should -Be 'UI1'
        }

        It 'a slice nested one heading level deeper (### under ## Outstanding) is still found' {
            # This is this repository's own design/30-slices.md shape: '## Outstanding' groups
            # '### UI<n>' individual slices, one level deeper than the kit's '## S<n>' examples.
            $path = New-SlicesDoc -Content @'
# Slices

## Outstanding

### UI1 — A slice

Acceptance:
  - UI1.1 The first criterion.
  - UI1.2 The second criterion.

### UI2 — Another slice

Acceptance:
  - UI2.1 A criterion belonging to the next slice.
'@
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'UI1 — A slice' -Body "- [ ] **UI1.1** first`n- [ ] **UI1.2** second"
                New-Issue -Number 10 -Title 'UI2 — Another slice' -Body '- [ ] **UI2.1** a criterion belonging to the next slice'
            ) }

            $r = Invoke-DriftCheck -SlicesPath $path -SlicePrefix 'UI'

            $r.State | Should -Be 'Clean'
            $r.SlicesCompared | Should -Be 2
        }

        It 'a slice heading nested under a ## Landed group is landed, not outstanding - no issue owed' {
            # This repository's own design/30-slices.md shape: landed slices are '### UI<n>'
            # headings under '## Landed', never the kit's landed-table rows.
            $path = New-SlicesDoc -Content @'
# Slices

## Landed

### UI1 — A slice that already shipped

**Status:** complete

### UI2 — Another that shipped

## Outstanding

### UI3 — A slice still in flight

Acceptance:
  - UI3.1 The only criterion.
'@
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'UI3 — A slice still in flight' -Body '- [ ] **UI3.1** the only criterion'
            ) }

            $r = Invoke-DriftCheck -SlicesPath $path -SlicePrefix 'UI'

            $r.State | Should -Be 'Clean'
            $r.SlicesCompared | Should -Be 1
            $r.Findings.Count | Should -Be 0
        }
    }

    Context 'pin ancestry' {

        BeforeEach {
            $script:PinnedDoc = New-SlicesDoc -Content $script:TwoCriterionDoc -Name 'pinned.md'
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'S1 — A slice' `
                    -Body "- [ ] **S1.1** first`n- [ ] **S1.2** second`n<!-- agent:start -->`nScope and criteria: ``design/30-slices.md`` § S1 @ ``deadbee```n<!-- agent:end -->"
            ) }
        }

        It 'a pin that is an ancestor of HEAD is Clean' {
            Mock Test-CommitIsAncestor { 'Ancestor' }

            $r = Invoke-DriftCheck -SlicesPath $script:PinnedDoc

            $r.State | Should -Be 'Clean'
            Should -Invoke Test-CommitIsAncestor -Exactly -Times 1
        }

        It 'a pin that is not an ancestor is drift, exit 1' {
            Mock Test-CommitIsAncestor { 'NotAncestor' }

            $r = Invoke-DriftCheck -SlicesPath $script:PinnedDoc

            $r.State | Should -Be 'Drifted'
            ($r.Findings | Where-Object Kind -eq 'PinNotAncestor').Detail | Should -Be 'deadbee'
            Get-DriftExitCode -State $r.State | Should -Be 1
        }

        It 'a pin this clone cannot resolve is NOT clean and NOT drift - it is exit 2' {
            # The distinction I12 exists for: absence of an answer never becomes an answer.
            Mock Test-CommitIsAncestor { 'Unresolvable' }

            $r = Invoke-DriftCheck -SlicesPath $script:PinnedDoc

            $r.State | Should -Be 'NotEvaluated'
            $r.Findings.Count | Should -Be 0
            $r.Failures.Reason | Should -Contain 'PinUnresolvable'
            Get-DriftExitCode -State $r.State | Should -Be 2
        }
    }

    Context 'incomplete runs never report clean' {

        It 'an unreadable tracker is NotEvaluated, exit 2' {
            $path = New-SlicesDoc -Content $script:TwoCriterionDoc
            Mock Get-TrackerIssue {
                [pscustomobject]@{ Issues = @(); Failure = (New-Failure -Reason 'GhUnavailable' -Detail 'gh exited 4') }
            }

            $r = Invoke-DriftCheck -SlicesPath $path

            $r.State | Should -Be 'NotEvaluated'
            $r.Failures.Reason | Should -Contain 'GhUnavailable'
            Get-DriftExitCode -State $r.State | Should -Be 2
        }

        It 'a missing slices document is NotEvaluated, and the tracker is never read' {
            Mock Get-TrackerIssue { New-Tracker }

            $r = Invoke-DriftCheck -SlicesPath (Join-Path $TestDrive 'nothing-here.md')

            $r.State | Should -Be 'NotEvaluated'
            $r.Failures.Reason | Should -Contain 'SlicesDocMissing'
            Should -Invoke Get-TrackerIssue -Exactly -Times 0
        }

        It 'a criterion numbered for another slice is unparseable, not silently filed' {
            $path = New-SlicesDoc -Content @'
# Slices

## S1 — A slice

Acceptance:
  - S1.1 The first criterion.
  - S2.4 Numbered for a slice this is not.
'@ -Name 'stray.md'
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'S1 — A slice' -Body '- [ ] **S1.1** first'
            ) }

            $r = Invoke-DriftCheck -SlicesPath $path

            $r.State | Should -Be 'NotEvaluated'
            $r.Failures.Reason | Should -Contain 'UnparseableCriterion'
        }

        It 'drift AND a failed comparison resolves to exit 2, never 1' {
            # 2 takes precedence: a run that found drift and also failed to finish is an
            # incomplete run, and reporting it as a finished one is the failure I12 forbids.
            $path = New-SlicesDoc -Content $script:TwoCriterionDoc -Name 'both.md'
            Mock Get-TrackerIssue { New-Tracker -Issues @(
                New-Issue -Number 9 -Title 'S1 — A slice' `
                    -Body "- [ ] **S1.1** first`n``design/30-slices.md`` § S1 @ ``deadbee``"
            ) }
            Mock Test-CommitIsAncestor { 'Unresolvable' }

            $r = Invoke-DriftCheck -SlicesPath $path

            $r.Findings.Kind | Should -Contain 'InDocNotIssue'
            $r.Failures.Reason | Should -Contain 'PinUnresolvable'
            $r.State | Should -Be 'NotEvaluated'
            Get-DriftExitCode -State $r.State | Should -Be 2
        }
    }

    Context 'exit code map' {

        It 'maps each state, and refuses an unknown one rather than defaulting to 0' {
            Get-DriftExitCode -State 'Clean'        | Should -Be 0
            Get-DriftExitCode -State 'Drifted'      | Should -Be 1
            Get-DriftExitCode -State 'NotEvaluated' | Should -Be 2
            { Get-DriftExitCode -State 'Something' } | Should -Throw
        }
    }
}
