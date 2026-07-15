# GamePMer M1 Foundation and Schedule Control Tower Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a single-user Windows desktop application that owns project/asset/stage schedules, shows an exception-first control tower, imports and exports Excel, and safely backs up its encrypted local database.

**Architecture:** A WPF MVVM shell calls application use cases; application use cases enforce pure domain rules and depend on interfaces; infrastructure adapters provide encrypted SQLite, Excel, backup, clock, and desktop notifications. M1 contains no Outlook, chat, feedback, quote, or closeout connector implementation, but its interfaces and project identifiers support those milestones without changing the scheduling core.

**Tech Stack:** C# 14, .NET 10 LTS, WPF, CommunityToolkit.Mvvm 8.4.2, EF Core 10.0.10, SQLitePCLRaw SQLCipher bundle 2.1.11, ClosedXML 0.105.0, xUnit v3 3.2.2.

## Global Constraints

- Target Windows 11 x64; Windows 10 is limited to company-managed ESU/LTSC devices. Publish self-contained `win-x64`.
- Domain and Application must not reference WPF, EF Core, ClosedXML, Outlook, file-system APIs, or wall-clock static APIs.
- The workbench is the only source of truth after import; no two-way Excel synchronization.
- Baseline dates are immutable after kickoff; current dates change only through an explicit schedule revision.
- No command may advance a later stage until the previous stage is customer-approved.
- Delays only flag downstream stages as requiring review; no automatic date shifting.
- All calculations use project work calendars; T-1 means the previous effective workday.
- All persistent commands write the business change and audit event in one database transaction.
- Database and API secrets are protected for the current Windows user; no secret or business content enters diagnostic logs.
- `SQLitePCLRaw.bundle_e_sqlcipher` 2.1.11 is an accepted M1 maintenance risk. Every release must verify encrypted-file unreadability, wrong-key rejection, WAL/SHM handling, backup restore, and the documented replacement path.
- Each implementation task uses test-first development and ends with a focused commit.

## Planned File Map

```text
global.json                                  # .NET SDK policy
Directory.Build.props                       # common compiler and analyzer rules
Directory.Packages.props                    # pinned NuGet versions
GamePMer.slnx                               # solution definition
src/GamePMer.Domain/                        # pure business rules
src/GamePMer.Application/                   # commands, queries, ports, DTOs
src/GamePMer.Infrastructure/                # encrypted SQLite, Excel, backup, notifications
src/GamePMer.Desktop/                       # WPF shell and feature UI
tests/GamePMer.Domain.Tests/                # domain unit tests
tests/GamePMer.Application.Tests/           # use-case tests
tests/GamePMer.Infrastructure.Tests/        # Windows/infrastructure integration tests
tests/GamePMer.Desktop.Tests/               # ViewModel tests
tests/GamePMer.AcceptanceTests/              # M1 end-to-end scenario
.github/workflows/ci.yml                    # Windows build and test
```

---

### Task 1: Repository and Solution Foundation

**Files:**
- Create: `global.json`
- Create: `Directory.Build.props`
- Create: `Directory.Packages.props`
- Create: `GamePMer.slnx`
- Create: `src/GamePMer.Domain/GamePMer.Domain.csproj`
- Create: `src/GamePMer.Application/GamePMer.Application.csproj`
- Create: `src/GamePMer.Infrastructure/GamePMer.Infrastructure.csproj`
- Create: `src/GamePMer.Desktop/GamePMer.Desktop.csproj`
- Create: `tests/GamePMer.Domain.Tests/GamePMer.Domain.Tests.csproj`
- Create: `tests/GamePMer.Application.Tests/GamePMer.Application.Tests.csproj`
- Create: `tests/GamePMer.Infrastructure.Tests/GamePMer.Infrastructure.Tests.csproj`
- Create: `tests/GamePMer.Desktop.Tests/GamePMer.Desktop.Tests.csproj`
- Create: `tests/GamePMer.AcceptanceTests/GamePMer.AcceptanceTests.csproj`
- Create: `.gitignore`

**Interfaces:**
- Produces: buildable project graph with Domain ← Application ← Infrastructure/Desktop dependency direction.

- [ ] **Step 1: Verify the empty workspace has no buildable solution**

Run:

```powershell
dotnet test GamePMer.slnx
```

Expected: FAIL because `GamePMer.slnx` does not exist.

- [ ] **Step 2: Create SDK and package policy files**

Create `global.json`:

```json
{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature",
    "allowPrerelease": false
  }
}
```

Create `Directory.Build.props`:

```xml
<Project>
  <PropertyGroup>
    <LangVersion>14.0</LangVersion>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
    <Deterministic>true</Deterministic>
  </PropertyGroup>
</Project>
```

Create `Directory.Packages.props`:

```xml
<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="ClosedXML" Version="0.105.0" />
    <PackageVersion Include="CommunityToolkit.Mvvm" Version="8.4.2" />
    <PackageVersion Include="Microsoft.Data.Sqlite.Core" Version="10.0.10" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore.Design" Version="10.0.10" />
    <PackageVersion Include="Microsoft.EntityFrameworkCore.Sqlite.Core" Version="10.0.10" />
    <PackageVersion Include="Microsoft.Extensions.Hosting" Version="10.0.10" />
    <PackageVersion Include="Microsoft.NET.Test.Sdk" Version="18.8.1" />
    <PackageVersion Include="SQLitePCLRaw.bundle_e_sqlcipher" Version="2.1.11" />
    <PackageVersion Include="System.Security.Cryptography.ProtectedData" Version="10.0.10" />
    <PackageVersion Include="coverlet.collector" Version="10.0.1" />
    <PackageVersion Include="xunit.runner.visualstudio" Version="3.1.5" />
    <PackageVersion Include="xunit.v3" Version="3.2.2" />
  </ItemGroup>
</Project>
```

- [ ] **Step 3: Create the project files with one-way references**

Use `net10.0` for Domain/Application and `net10.0-windows10.0.19041.0` for Windows projects. The Desktop project file must contain:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0-windows10.0.19041.0</TargetFramework>
    <UseWPF>true</UseWPF>
    <UseWindowsForms>true</UseWindowsForms>
    <ApplicationManifest>app.manifest</ApplicationManifest>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="CommunityToolkit.Mvvm" />
    <PackageReference Include="Microsoft.Extensions.Hosting" />
    <ProjectReference Include="..\GamePMer.Application\GamePMer.Application.csproj" />
    <ProjectReference Include="..\GamePMer.Infrastructure\GamePMer.Infrastructure.csproj" />
  </ItemGroup>
</Project>
```

The Infrastructure project references Application and the persistence/security packages. Each test project references the project it tests and these common test packages:

```xml
<ItemGroup>
  <PackageReference Include="Microsoft.NET.Test.Sdk" />
  <PackageReference Include="xunit.v3" />
  <PackageReference Include="xunit.runner.visualstudio" PrivateAssets="all" />
  <PackageReference Include="coverlet.collector" PrivateAssets="all" />
</ItemGroup>
```

- [ ] **Step 4: Create solution and ignore rules**

Run:

```powershell
dotnet new sln --format slnx --name GamePMer
dotnet sln GamePMer.slnx add (Get-ChildItem -Recurse -Filter *.csproj | ForEach-Object FullName)
```

Add `.gitignore` entries for `bin/`, `obj/`, `.vs/`, `TestResults/`, `artifacts/`, `.superpowers/`, `*.user`, `*.db`, `*.db-*`, `*.key`, `*.log`, `*.msix`, and `*.pfx`.

- [ ] **Step 5: Build the empty solution**

Run:

```powershell
dotnet restore GamePMer.slnx
dotnet build GamePMer.slnx -c Release --no-restore
dotnet test GamePMer.slnx -c Release --no-build
```

Expected: restore, build, and all empty test projects succeed.

- [ ] **Step 6: Commit**

```powershell
git add global.json Directory.Build.props Directory.Packages.props GamePMer.slnx src tests .gitignore
git commit -m "build: scaffold GamePMer solution"
```

---

### Task 2: Work Calendar and Date Calculations

**Files:**
- Create: `src/GamePMer.Domain/Common/DomainValidationException.cs`
- Create: `src/GamePMer.Domain/Scheduling/WorkCalendar.cs`
- Create: `src/GamePMer.Domain/Scheduling/CalendarOverride.cs`
- Test: `tests/GamePMer.Domain.Tests/Scheduling/WorkCalendarTests.cs`

**Interfaces:**
- Produces: `WorkCalendar.IsWorkday(DateOnly)`, `PreviousWorkday(DateOnly)`, `AddWorkdays(DateOnly, decimal)`, and `CountWorkdays(DateOnly, DateOnly)`.

- [ ] **Step 1: Write failing calendar tests**

```csharp
public sealed class WorkCalendarTests
{
    private static readonly WorkCalendar Calendar = WorkCalendar.Standard(
        "CN-2026",
        [new(new DateOnly(2026, 10, 1), false),
         new(new DateOnly(2026, 10, 2), false),
         new(new DateOnly(2026, 10, 10), true)]);

    [Fact]
    public void PreviousWorkday_skips_weekend_and_holiday()
    {
        Calendar.PreviousWorkday(new DateOnly(2026, 10, 5))
            .ShouldBe(new DateOnly(2026, 9, 30));
    }

    [Fact]
    public void AddWorkdays_rounds_fractional_person_days_up()
    {
        Calendar.AddWorkdays(new DateOnly(2026, 7, 17), 1.5m)
            .ShouldBe(new DateOnly(2026, 7, 20));
    }

    [Fact]
    public void Explicit_workday_override_includes_weekend()
    {
        Assert.True(Calendar.IsWorkday(new DateOnly(2026, 10, 10)));
    }
}
```

Add this local helper to the test project so the plan does not introduce an assertion-library dependency:

```csharp
internal static class AssertExtensions
{
    public static void ShouldBe<T>(this T actual, T expected) => Assert.Equal(expected, actual);
}
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
dotnet test tests/GamePMer.Domain.Tests --filter FullyQualifiedName~WorkCalendarTests
```

Expected: FAIL because `WorkCalendar` and `CalendarOverride` do not exist.

- [ ] **Step 3: Implement the minimal calendar**

```csharp
public sealed record CalendarOverride(DateOnly Date, bool IsWorkday);

public sealed class WorkCalendar
{
    private readonly IReadOnlyDictionary<DateOnly, bool> _overrides;

    private WorkCalendar(string code, IEnumerable<CalendarOverride> overrides)
    {
        Code = code;
        _overrides = overrides.ToDictionary(x => x.Date, x => x.IsWorkday);
    }

    public string Code { get; }

    public static WorkCalendar Standard(string code, IEnumerable<CalendarOverride> overrides) =>
        new(code, overrides);

    public bool IsWorkday(DateOnly date)
    {
        if (_overrides.TryGetValue(date, out var value)) return value;
        return date.DayOfWeek is not DayOfWeek.Saturday and not DayOfWeek.Sunday;
    }

    public DateOnly PreviousWorkday(DateOnly date)
    {
        var candidate = date.AddDays(-1);
        while (!IsWorkday(candidate)) candidate = candidate.AddDays(-1);
        return candidate;
    }

    public DateOnly AddWorkdays(DateOnly start, decimal personDays)
    {
        if (personDays <= 0) throw new DomainValidationException("personDays must be positive");
        var remaining = decimal.ToInt32(decimal.Ceiling(personDays));
        var candidate = start;
        while (remaining > 1)
        {
            candidate = candidate.AddDays(1);
            if (IsWorkday(candidate)) remaining--;
        }
        while (!IsWorkday(candidate)) candidate = candidate.AddDays(1);
        return candidate;
    }

    public int CountWorkdays(DateOnly start, DateOnly finish)
    {
        if (finish < start) throw new DomainValidationException("finish precedes start");
        var count = 0;
        for (var day = start; day <= finish; day = day.AddDays(1))
            if (IsWorkday(day)) count++;
        return count;
    }
}
```

- [ ] **Step 4: Run all Domain tests**

```powershell
dotnet test tests/GamePMer.Domain.Tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/GamePMer.Domain tests/GamePMer.Domain.Tests
git commit -m "feat: add work calendar calculations"
```

---

### Task 3: Project, Asset, and Stage Templates

**Files:**
- Create: `src/GamePMer.Domain/Projects/ProjectId.cs`
- Create: `src/GamePMer.Domain/Projects/Project.cs`
- Create: `src/GamePMer.Domain/Projects/ProjectStatus.cs`
- Create: `src/GamePMer.Domain/Projects/ProductionType.cs`
- Create: `src/GamePMer.Domain/Projects/PersonRole.cs`
- Create: `src/GamePMer.Domain/Projects/ProjectContact.cs`
- Create: `src/GamePMer.Domain/Projects/ProjectPaths.cs`
- Create: `src/GamePMer.Domain/Projects/Asset.cs`
- Create: `src/GamePMer.Domain/Scheduling/StageDefinition.cs`
- Create: `src/GamePMer.Domain/Scheduling/StageTemplates.cs`
- Create: `src/GamePMer.Domain/Scheduling/StagePlan.cs`
- Test: `tests/GamePMer.Domain.Tests/Projects/ProjectTests.cs`
- Test: `tests/GamePMer.Domain.Tests/Scheduling/StageTemplateTests.cs`

**Interfaces:**
- Produces: `Project.Create(...)`, `Project.AddAsset(...)`, `StageTemplates.For(ProductionType)`, and stable stage codes.

- [ ] **Step 1: Write failing template and aggregate tests**

```csharp
[Fact]
public void TwoD_template_has_expected_order()
{
    var codes = StageTemplates.For(ProductionType.TwoD).Select(x => x.Code);
    Assert.Equal(["2D_SKETCH", "2D_DETAIL_50", "2D_FINAL"], codes);
}

[Fact]
public void ThreeD_template_has_expected_order()
{
    var codes = StageTemplates.For(ProductionType.ThreeD).Select(x => x.Code);
    Assert.Equal(["3D_MID", "3D_HIGH", "3D_LOW", "3D_BAKE", "3D_TEXTURE", "3D_LOD"], codes);
}

[Fact]
public void Project_rejects_duplicate_asset_code()
{
    var project = Project.Create("P-001", "Project", "Client", ProductionType.TwoD, 2);
    project.AddAsset("A-01", "Hero", ProductionType.TwoD, 6m);
    Assert.Throws<DomainValidationException>(() =>
        project.AddAsset("A-01", "Duplicate", ProductionType.TwoD, 4m));
}

[Fact]
public void Same_person_in_two_roles_is_returned_once_for_notifications()
{
    var project = Project.Create("P-001", "Project", "Client", ProductionType.TwoD, 2);
    project.SetContact(PersonRole.Bd, "P-100", "Owner", "owner@example.test");
    project.SetContact(PersonRole.Lead, "P-100", "Owner", "owner@example.test");
    Assert.Single(project.DistinctNotificationContacts());
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Domain.Tests --filter "FullyQualifiedName~ProjectTests|FullyQualifiedName~StageTemplateTests"
```

Expected: FAIL because the project aggregate and stage templates do not exist.

- [ ] **Step 3: Implement stable templates and project creation**

```csharp
public enum ProductionType { TwoD, ThreeD, Mixed }

public sealed record StageDefinition(string Code, string Name, int Sequence);

public static class StageTemplates
{
    private static readonly StageDefinition[] TwoD =
    [
        new("2D_SKETCH", "草图", 1),
        new("2D_DETAIL_50", "细化 50%", 2),
        new("2D_FINAL", "完成稿", 3)
    ];

    private static readonly StageDefinition[] ThreeD =
    [
        new("3D_MID", "中模", 1),
        new("3D_HIGH", "高模", 2),
        new("3D_LOW", "低模", 3),
        new("3D_BAKE", "烘焙", 4),
        new("3D_TEXTURE", "贴图", 5),
        new("3D_LOD", "LOD", 6)
    ];

    public static IReadOnlyList<StageDefinition> For(ProductionType type) => type switch
    {
        ProductionType.TwoD => TwoD,
        ProductionType.ThreeD => ThreeD,
        _ => throw new DomainValidationException("Mixed assets must choose a concrete production type")
    };
}
```

`Project.AddAsset` creates one `StagePlan` per copied stage definition and enforces project-local asset code uniqueness. `ProjectContact` stores role, person ID, display name, and email; `ProjectPaths` stores production, submission, feedback, and final-package roots. `DistinctNotificationContacts` de-duplicates by person ID first and normalized email second. Use `Guid`-backed strongly typed IDs and expose collections as `IReadOnlyList<T>`.

- [ ] **Step 4: Run Domain tests**

```powershell
dotnet test tests/GamePMer.Domain.Tests
```

Expected: PASS with exact 2D/3D stage order and duplicate protection.

- [ ] **Step 5: Commit**

```powershell
git add src/GamePMer.Domain tests/GamePMer.Domain.Tests
git commit -m "feat: model projects assets and stage templates"
```

---

### Task 4: Schedule Baseline, Revisions, and Customer Stage Gate

**Files:**
- Create: `src/GamePMer.Domain/Scheduling/StageStatus.cs`
- Create: `src/GamePMer.Domain/Scheduling/ScheduleReasonCode.cs`
- Create: `src/GamePMer.Domain/Scheduling/ScheduleRevision.cs`
- Create: `src/GamePMer.Domain/Scheduling/ScheduleRevisionItem.cs`
- Modify: `src/GamePMer.Domain/Scheduling/StagePlan.cs`
- Modify: `src/GamePMer.Domain/Projects/Asset.cs`
- Test: `tests/GamePMer.Domain.Tests/Scheduling/StagePlanTests.cs`
- Test: `tests/GamePMer.Domain.Tests/Scheduling/ScheduleRevisionTests.cs`

**Interfaces:**
- Produces: `StagePlan.SetDraftSchedule`, `FreezeBaseline`, `ReviseCurrent`, `MarkHandedToPm`, `MarkSubmitted`, `RecordCustomerApproval`, and `Asset.FlagDownstreamForReview`.

- [ ] **Step 1: Write failing schedule behavior tests**

```csharp
[Fact]
public void Frozen_baseline_cannot_be_overwritten()
{
    var stage = StagePlan.Create("2D_SKETCH", 1, 2m);
    stage.SetDraftSchedule(new DateOnly(2026, 7, 20), new DateOnly(2026, 7, 21));
    stage.FreezeBaseline();

    Assert.Throws<DomainValidationException>(() =>
        stage.SetDraftSchedule(new DateOnly(2026, 7, 21), new DateOnly(2026, 7, 22)));
}

[Fact]
public void Next_stage_cannot_start_until_previous_customer_approved()
{
    var asset = Asset.Create("A-01", "Hero", ProductionType.TwoD, 6m);
    Assert.Throws<DomainValidationException>(() => asset.StartStage("2D_DETAIL_50"));
}

[Fact]
public void Revision_flags_only_unfinished_downstream_stages()
{
    var asset = Asset.Create("A-01", "Hero", ProductionType.TwoD, 6m);
    asset.ReviseStage("2D_SKETCH", new DateOnly(2026, 7, 22), new DateOnly(2026, 7, 24));
    Assert.True(asset.Stage("2D_DETAIL_50").RevisionRequired);
    Assert.True(asset.Stage("2D_FINAL").RevisionRequired);
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Domain.Tests --filter "FullyQualifiedName~StagePlanTests|FullyQualifiedName~ScheduleRevisionTests"
```

Expected: FAIL because schedule state methods do not exist.

- [ ] **Step 3: Implement schedule state and revision records**

```csharp
public enum StageStatus
{
    NotStarted,
    InProduction,
    HandedToPm,
    ReadyToSubmit,
    AwaitingClient,
    ClientFeedbackOverdue,
    Rework,
    ClientApproved
}

public enum ScheduleReasonCode
{
    TeamDelay,
    ClientFeedbackDelay,
    ExtraRevisionRound,
    RequirementChange,
    ExternalDependency,
    PmAdjustment,
    Other
}

public sealed record ScheduleRevisionItem(
    Guid StagePlanId,
    DateOnly OldStart,
    DateOnly OldFinish,
    DateOnly NewStart,
    DateOnly NewFinish);

public sealed record ScheduleRevision(
    Guid Id,
    Guid ProjectId,
    ScheduleReasonCode Reason,
    string Note,
    DateTimeOffset CreatedAt,
    IReadOnlyList<ScheduleRevisionItem> Items);
```

`StagePlan.ReviseCurrent` validates start ≤ finish, requires a reason, changes only current dates, and increments `Version`. `Asset.ReviseStage` marks all later non-approved stages `RevisionRequired = true` without changing their dates. State transition methods reject out-of-order calls.

- [ ] **Step 4: Run Domain tests**

```powershell
dotnet test tests/GamePMer.Domain.Tests
```

Expected: PASS, including baseline immutability and the customer approval gate.

- [ ] **Step 5: Commit**

```powershell
git add src/GamePMer.Domain tests/GamePMer.Domain.Tests
git commit -m "feat: enforce schedule revisions and stage gates"
```

---

### Task 5: Risk Engine and Reminder Candidates

**Files:**
- Create: `src/GamePMer.Domain/Scheduling/RiskKind.cs`
- Create: `src/GamePMer.Domain/Scheduling/RiskItem.cs`
- Create: `src/GamePMer.Domain/Scheduling/RiskEvaluator.cs`
- Create: `src/GamePMer.Domain/Scheduling/ReminderCandidate.cs`
- Test: `tests/GamePMer.Domain.Tests/Scheduling/RiskEvaluatorTests.cs`

**Interfaces:**
- Consumes: `WorkCalendar`, Project, Asset, StagePlan.
- Produces: `RiskEvaluator.Evaluate(Project, DateOnly)` and `CreateTMinusOneReminder`.

- [ ] **Step 1: Write failing risk tests**

```csharp
[Fact]
public void T_minus_one_uses_previous_effective_workday()
{
    var stage = TestStage.AwaitingTeam(finish: new DateOnly(2026, 7, 20));
    var risks = RiskEvaluator.Evaluate(stage, TestCalendar.Standard, new DateOnly(2026, 7, 17));
    Assert.Contains(risks, x => x.Kind == RiskKind.TMinusOne);
}

[Fact]
public void Completed_handoff_suppresses_t_minus_one()
{
    var stage = TestStage.HandedToPm(finish: new DateOnly(2026, 7, 20));
    var risks = RiskEvaluator.Evaluate(stage, TestCalendar.Standard, new DateOnly(2026, 7, 17));
    Assert.DoesNotContain(risks, x => x.Kind == RiskKind.TMinusOne);
}

[Fact]
public void Customer_wait_is_not_team_delay()
{
    var stage = TestStage.AwaitingClient(
        feedbackDue: new DateOnly(2026, 7, 15),
        currentFinish: new DateOnly(2026, 7, 14));
    var risks = RiskEvaluator.Evaluate(stage, TestCalendar.Standard, new DateOnly(2026, 7, 16));
    Assert.Contains(risks, x => x.Kind == RiskKind.ClientFeedbackOverdue);
    Assert.DoesNotContain(risks, x => x.Kind == RiskKind.TeamOverdue);
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Domain.Tests --filter FullyQualifiedName~RiskEvaluatorTests
```

Expected: FAIL because the risk engine does not exist.

- [ ] **Step 3: Implement pure risk projection**

```csharp
public enum RiskKind
{
    DueToday,
    TMinusOne,
    TeamOverdue,
    ClientFeedbackOverdue,
    ScheduleRevisionRequired,
    CloseoutBlocked,
    ConnectorFailure,
    UnclassifiedHighPriority
}

public sealed record RiskItem(
    RiskKind Kind,
    Guid ProjectId,
    Guid AssetId,
    Guid StagePlanId,
    DateOnly EffectiveDate,
    string Message);
```

`RiskEvaluator` returns a new list each call and never mutates project data. A T-1 risk is created only when today equals `calendar.PreviousWorkday(CurrentFinish)` and the stage is still `NotStarted` or `InProduction`. Customer waiting states use the feedback due date and never produce TeamOverdue.

- [ ] **Step 4: Run Domain tests**

```powershell
dotnet test tests/GamePMer.Domain.Tests
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/GamePMer.Domain tests/GamePMer.Domain.Tests
git commit -m "feat: calculate schedule risks and reminders"
```

---

### Task 6: Application Ports, Commands, and Audit Transactions

**Files:**
- Create: `src/GamePMer.Application/Abstractions/IClock.cs`
- Create: `src/GamePMer.Application/Abstractions/IProjectRepository.cs`
- Create: `src/GamePMer.Application/Abstractions/IUnitOfWork.cs`
- Create: `src/GamePMer.Application/Abstractions/IAuditWriter.cs`
- Create: `src/GamePMer.Application/Common/Result.cs`
- Create: `src/GamePMer.Application/Projects/CreateProjectCommand.cs`
- Create: `src/GamePMer.Application/Projects/CreateProjectHandler.cs`
- Create: `src/GamePMer.Application/Scheduling/ReviseScheduleCommand.cs`
- Create: `src/GamePMer.Application/Scheduling/ReviseScheduleHandler.cs`
- Create: `src/GamePMer.Application/Dashboard/GetDashboardQuery.cs`
- Create: `src/GamePMer.Application/Dashboard/GetDashboardHandler.cs`
- Test: `tests/GamePMer.Application.Tests/Projects/CreateProjectHandlerTests.cs`
- Test: `tests/GamePMer.Application.Tests/Scheduling/ReviseScheduleHandlerTests.cs`

**Interfaces:**
- Consumes: Domain aggregates and risk engine.
- Produces: repository, unit-of-work, clock, audit ports and transactional handlers.

- [ ] **Step 1: Write failing handler tests with in-memory fakes**

```csharp
[Fact]
public async Task CreateProject_persists_project_and_audit_together()
{
    var store = new FakeProjectStore();
    var audit = new FakeAuditWriter();
    var unit = new FakeUnitOfWork();
    var handler = new CreateProjectHandler(store, audit, unit, new FixedClock());

    var result = await handler.Handle(
        new("P-001", "Project", "Client", ProductionType.TwoD, 2),
        CancellationToken.None);

    Assert.True(result.IsSuccess);
    Assert.Single(store.Projects);
    Assert.Equal("ProjectCreated", Assert.Single(audit.Events).EventType);
    Assert.Equal(1, unit.CommitCount);
}

[Fact]
public async Task Failed_revision_does_not_commit_or_write_audit()
{
    var fixture = ScheduleHandlerFixture.WithFrozenProject();
    var result = await fixture.Handler.Handle(
        fixture.InvalidReversedDateCommand(), CancellationToken.None);

    Assert.False(result.IsSuccess);
    Assert.Equal(0, fixture.UnitOfWork.CommitCount);
    Assert.Empty(fixture.Audit.Events);
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Application.Tests --filter "FullyQualifiedName~CreateProjectHandlerTests|FullyQualifiedName~ReviseScheduleHandlerTests"
```

Expected: FAIL because the ports and handlers do not exist.

- [ ] **Step 3: Implement explicit result and ports**

```csharp
public sealed record Error(string Code, string Message, string? Field = null);

public sealed class Result<T>
{
    private Result(T? value, IReadOnlyList<Error> errors)
        => (Value, Errors) = (value, errors);
    public T? Value { get; }
    public IReadOnlyList<Error> Errors { get; }
    public bool IsSuccess => Errors.Count == 0;
    public static Result<T> Success(T value) => new(value, []);
    public static Result<T> Failure(params Error[] errors) => new(default, errors);
}

public interface IClock
{
    DateTimeOffset UtcNow { get; }
    DateOnly Today { get; }
}

public interface IProjectRepository
{
    Task<bool> CodeExistsAsync(string code, CancellationToken cancellationToken);
    Task<Project?> GetAsync(ProjectId id, CancellationToken cancellationToken);
    Task AddAsync(Project project, CancellationToken cancellationToken);
}

public interface IUnitOfWork
{
    Task CommitAsync(CancellationToken cancellationToken);
}
```

`IAuditWriter.Write` accepts an `AuditEvent` with entity type/id, event type, reason, UTC time, and a JSON-safe before/after summary containing no message body or file content.

- [ ] **Step 4: Implement handlers with one commit point**

```csharp
public sealed class CreateProjectHandler(
    IProjectRepository projects,
    IAuditWriter audit,
    IUnitOfWork unitOfWork,
    IClock clock)
{
    public async Task<Result<ProjectId>> Handle(
        CreateProjectCommand command,
        CancellationToken cancellationToken)
    {
        if (await projects.CodeExistsAsync(command.Code, cancellationToken))
            return Result<ProjectId>.Failure(new("project.code.duplicate", "项目编号已存在", "Code"));

        try
        {
            var project = Project.Create(
                command.Code, command.Name, command.ClientName,
                command.ProductionType, command.CustomerFeedbackSlaDays);
            await projects.AddAsync(project, cancellationToken);
            audit.Write(AuditEvent.ProjectCreated(project, clock.UtcNow));
            await unitOfWork.CommitAsync(cancellationToken);
            return Result<ProjectId>.Success(project.Id);
        }
        catch (DomainValidationException ex)
        {
            return Result<ProjectId>.Failure(new("project.validation", ex.Message));
        }
    }
}
```

Use the same structure for `ReviseScheduleHandler`: load aggregate, apply one revision batch, write one audit event, commit once.

- [ ] **Step 5: Run Application tests**

```powershell
dotnet test tests/GamePMer.Application.Tests
```

Expected: PASS and failed commands produce no commit.

- [ ] **Step 6: Commit**

```powershell
git add src/GamePMer.Application tests/GamePMer.Application.Tests
git commit -m "feat: add transactional scheduling use cases"
```

---

### Task 7: Encrypted SQLite Persistence and DPAPI Key Store

**Files:**
- Create: `src/GamePMer.Infrastructure/Security/DpapiSecretStore.cs`
- Create: `src/GamePMer.Infrastructure/Persistence/GamePMerDbContext.cs`
- Create: `src/GamePMer.Infrastructure/Persistence/ProjectConfiguration.cs`
- Create: `src/GamePMer.Infrastructure/Persistence/AssetConfiguration.cs`
- Create: `src/GamePMer.Infrastructure/Persistence/StagePlanConfiguration.cs`
- Create: `src/GamePMer.Infrastructure/Persistence/ScheduleRevisionConfiguration.cs`
- Create: `src/GamePMer.Infrastructure/Persistence/AuditEventConfiguration.cs`
- Create: `src/GamePMer.Infrastructure/Persistence/SqliteProjectRepository.cs`
- Create: `src/GamePMer.Infrastructure/Persistence/DatabaseBootstrapper.cs`
- Create: `src/GamePMer.Infrastructure/DependencyInjection.cs`
- Test: `tests/GamePMer.Infrastructure.Tests/Security/DpapiSecretStoreTests.cs`
- Test: `tests/GamePMer.Infrastructure.Tests/Persistence/EncryptedDatabaseTests.cs`
- Test: `tests/GamePMer.Infrastructure.Tests/Persistence/ProjectRepositoryTests.cs`

**Interfaces:**
- Implements: `IProjectRepository`, `IUnitOfWork`, `IAuditWriter`.
- Produces: `DatabaseBootstrapper.InitializeAsync` and current-user encrypted SQLite.

- [ ] **Step 1: Write failing encryption and round-trip tests**

```csharp
[Fact]
public void Dpapi_secret_round_trips_for_current_user()
{
    using var folder = TempFolder.Create();
    var store = new DpapiSecretStore(folder.Path);
    store.Set("database", "correct horse battery staple");
    Assert.Equal("correct horse battery staple", store.Get("database"));
    Assert.DoesNotContain("correct horse", File.ReadAllText(store.PathFor("database")));
}

[Fact]
public async Task Encrypted_database_rejects_connection_without_password()
{
    using var fixture = await EncryptedDatabaseFixture.CreateAsync();
    await Assert.ThrowsAnyAsync<SqliteException>(async () =>
    {
        await using var connection = new SqliteConnection($"Data Source={fixture.DatabasePath}");
        await connection.OpenAsync();
        await new SqliteCommand("SELECT count(*) FROM Projects", connection).ExecuteScalarAsync();
    });
}

[Fact]
public async Task Project_round_trips_with_stages_and_audit()
{
    using var fixture = await EncryptedDatabaseFixture.CreateAsync();
    var projectId = await fixture.CreateSampleProjectAsync();
    fixture.ClearTracking();
    var loaded = await fixture.Repository.GetAsync(projectId, CancellationToken.None);
    Assert.NotNull(loaded);
    Assert.Equal(3, loaded.Assets.Single().StagePlans.Count);
    Assert.Single(await fixture.AuditEventsAsync());
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Infrastructure.Tests --filter "FullyQualifiedName~DpapiSecretStoreTests|FullyQualifiedName~EncryptedDatabaseTests|FullyQualifiedName~ProjectRepositoryTests"
```

Expected: FAIL because persistence and secret storage are absent.

- [ ] **Step 3: Implement current-user secret protection**

```csharp
public sealed class DpapiSecretStore(string directory)
{
    private static readonly byte[] Entropy = "GamePMer/v1"u8.ToArray();

    public string PathFor(string name) => Path.Combine(directory, name + ".bin");

    public void Set(string name, string secret)
    {
        Directory.CreateDirectory(directory);
        var plaintext = Encoding.UTF8.GetBytes(secret);
        var protectedBytes = ProtectedData.Protect(
            plaintext, Entropy, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(PathFor(name), protectedBytes);
        CryptographicOperations.ZeroMemory(plaintext);
    }

    public string Get(string name)
    {
        var protectedBytes = File.ReadAllBytes(PathFor(name));
        var plaintext = ProtectedData.Unprotect(
            protectedBytes, Entropy, DataProtectionScope.CurrentUser);
        try { return Encoding.UTF8.GetString(plaintext); }
        finally { CryptographicOperations.ZeroMemory(plaintext); }
    }
}
```

- [ ] **Step 4: Configure SQLCipher and EF Core**

Initialize SQLitePCL once before any connection:

```csharp
SQLitePCL.Batteries_V2.Init();
var builder = new SqliteConnectionStringBuilder
{
    DataSource = databasePath,
    Mode = SqliteOpenMode.ReadWriteCreate,
    Password = databasePassword,
    Pooling = true
};
services.AddDbContext<GamePMerDbContext>(options => options.UseSqlite(builder.ToString()));
```

Configure unique indexes for project code and `(ProjectId, AssetCode)`, store enums as strings, and use an integer `Version` concurrency token on Project, Asset, and StagePlan. Apply the first migration named `InitialM1Schema`.

- [ ] **Step 5: Implement repository and unit of work**

`GamePMerDbContext.SaveChangesAsync` is the only commit path. Repository methods never call SaveChanges. `IAuditWriter.Write` adds an AuditEvent entity to the same DbContext so business data and audit persist atomically.

- [ ] **Step 6: Run infrastructure tests and inspect the file header**

```powershell
dotnet test tests/GamePMer.Infrastructure.Tests --filter "FullyQualifiedName~DpapiSecretStoreTests|FullyQualifiedName~EncryptedDatabaseTests|FullyQualifiedName~ProjectRepositoryTests"
```

Expected: tests PASS; the encryption test verifies that a passwordless connection cannot read the database.

- [ ] **Step 7: Commit**

```powershell
git add src/GamePMer.Infrastructure tests/GamePMer.Infrastructure.Tests
git commit -m "feat: persist projects in encrypted local database"
```

---

### Task 8: Excel Import Preview and Export

**Files:**
- Create: `src/GamePMer.Application/Excel/IScheduleWorkbookService.cs`
- Create: `src/GamePMer.Application/Excel/ScheduleImportRow.cs`
- Create: `src/GamePMer.Application/Excel/ImportIssue.cs`
- Create: `src/GamePMer.Application/Excel/ScheduleImportPreview.cs`
- Create: `src/GamePMer.Application/Excel/ImportProjectDraft.cs`
- Create: `src/GamePMer.Application/Excel/PreviewScheduleImportHandler.cs`
- Create: `src/GamePMer.Application/Excel/CommitScheduleImportHandler.cs`
- Create: `src/GamePMer.Infrastructure/Excel/ClosedXmlScheduleWorkbookService.cs`
- Test: `tests/GamePMer.Infrastructure.Tests/Excel/ScheduleWorkbookTests.cs`
- Test: `tests/GamePMer.Application.Tests/Excel/CommitScheduleImportTests.cs`

**Interfaces:**
- Produces: preview-before-commit import and deterministic workbook export.

- [ ] **Step 1: Write failing workbook tests**

```csharp
[Fact]
public async Task Preview_reports_exact_row_and_column_for_invalid_date()
{
    using var workbook = WorkbookFixture.Create(row => row.BaselineFinish = "not-a-date");
    var preview = await _service.PreviewAsync(workbook.Path, CancellationToken.None);
    var issue = Assert.Single(preview.Issues);
    Assert.Equal(2, issue.Row);
    Assert.Equal("BaselineFinish", issue.Column);
}

[Fact]
public async Task Valid_workbook_round_trips_project_asset_and_stage()
{
    using var workbook = WorkbookFixture.ValidTwoDAndThreeD();
    var preview = await _service.PreviewAsync(workbook.Path, CancellationToken.None);
    Assert.Empty(preview.Issues);
    Assert.Equal(2, preview.Projects.Count);

    var exported = Path.Combine(workbook.Folder, "export.xlsx");
    await _service.ExportAsync(preview.Projects, exported, CancellationToken.None);
    var secondPreview = await _service.PreviewAsync(exported, CancellationToken.None);
    Assert.Empty(secondPreview.Issues);
    Assert.Equal(preview.Rows.Count, secondPreview.Rows.Count);
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Infrastructure.Tests --filter FullyQualifiedName~ScheduleWorkbookTests
```

Expected: FAIL because the workbook service does not exist.

- [ ] **Step 3: Define the exact import schema**

The sheet name is `Schedule`. Required columns are:

```text
ProjectCode, ProjectName, ClientName, ProductionType,
AssetCode, AssetName, StageCode, EstimatedPersonDays,
BaselineStart, BaselineFinish, CustomerFeedbackSlaDays
```

Dates are true Excel dates or `yyyy-MM-dd`; ProductionType is `2D` or `3D`; person-days is a positive decimal; stage codes must match the selected template.

- [ ] **Step 4: Implement ClosedXML preview and export**

```csharp
public sealed record ImportIssue(int Row, string Column, string Code, string Message);

public sealed record ScheduleImportPreview(
    IReadOnlyList<ScheduleImportRow> Rows,
    IReadOnlyList<ImportProjectDraft> Projects,
    IReadOnlyList<ImportIssue> Issues)
{
    public bool CanCommit => Issues.Count == 0;
}
```

Read headers by name, never by hard-coded column number. Do not stop at the first bad row. Export uses the same schema and writes a hidden `Metadata` sheet with `SchemaVersion = 1` and `ExportedAtUtc`.

- [ ] **Step 5: Implement atomic commit**

`CommitScheduleImportHandler` rejects previews with issues, rechecks project code uniqueness, creates all aggregates, writes one `ScheduleImported` audit batch, and commits once.

- [ ] **Step 6: Run Excel and application tests**

```powershell
dotnet test tests/GamePMer.Infrastructure.Tests --filter FullyQualifiedName~ScheduleWorkbookTests
dotnet test tests/GamePMer.Application.Tests --filter FullyQualifiedName~CommitScheduleImportTests
```

Expected: PASS; invalid workbooks produce precise issues and write no project.

- [ ] **Step 7: Commit**

```powershell
git add src/GamePMer.Application src/GamePMer.Infrastructure tests
git commit -m "feat: import and export schedule workbooks"
```

---

### Task 9: Verified Local Backup and Restore

**Files:**
- Create: `src/GamePMer.Application/Backup/IBackupService.cs`
- Create: `src/GamePMer.Application/Backup/BackupDescriptor.cs`
- Create: `src/GamePMer.Infrastructure/Backup/SqliteBackupService.cs`
- Create: `src/GamePMer.Infrastructure/Backup/BackupRetentionPolicy.cs`
- Create: `src/GamePMer.Infrastructure/Backup/EncryptedMigrationPackageService.cs`
- Create: `src/GamePMer.Infrastructure/Backup/MigrationSnapshotService.cs`
- Test: `tests/GamePMer.Infrastructure.Tests/Backup/SqliteBackupServiceTests.cs`
- Test: `tests/GamePMer.Infrastructure.Tests/Backup/EncryptedMigrationPackageTests.cs`

**Interfaces:**
- Produces: `CreateVerifiedBackupAsync`, `ListBackupsAsync`, and `RestoreAsync`.

- [ ] **Step 1: Write failing backup tests**

```csharp
[Fact]
public async Task Backup_opens_with_key_and_contains_expected_project()
{
    using var fixture = await BackupFixture.CreateAsync();
    var backup = await fixture.Service.CreateVerifiedBackupAsync(CancellationToken.None);
    Assert.True(File.Exists(backup.Path));
    Assert.True(backup.Verified);
    Assert.Equal(1, await fixture.CountProjectsInAsync(backup.Path));
}

[Fact]
public async Task Retention_keeps_fourteen_daily_and_four_weekly()
{
    var backups = BackupSamples.ForConsecutiveDays(40);
    var kept = BackupRetentionPolicy.SelectToKeep(backups, daily: 14, weekly: 4);
    Assert.True(kept.Count <= 18);
    Assert.Contains(kept, x => x.CreatedAt.Date == backups.Max(y => y.CreatedAt).Date);
}

[Fact]
public async Task Restore_preserves_current_database_as_pre_restore_backup()
{
    using var fixture = await BackupFixture.CreateAsync();
    var source = await fixture.Service.CreateVerifiedBackupAsync(CancellationToken.None);
    await fixture.ChangeDatabaseAsync();
    await fixture.Service.RestoreAsync(source.Id, CancellationToken.None);
    Assert.NotNull(fixture.FindBackupByReason("pre-restore"));
}

[Fact]
public async Task Migration_package_rejects_wrong_passphrase_without_replacing_database()
{
    using var fixture = await BackupFixture.CreateAsync();
    var package = await fixture.Migration.ExportAsync("correct-passphrase", CancellationToken.None);
    var originalHash = fixture.CurrentDatabaseHash();
    await Assert.ThrowsAsync<CryptographicException>(() =>
        fixture.Migration.ImportAsync(package.Path, "wrong-passphrase", CancellationToken.None));
    Assert.Equal(originalHash, fixture.CurrentDatabaseHash());
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Infrastructure.Tests --filter FullyQualifiedName~SqliteBackupServiceTests
```

Expected: FAIL because the backup service does not exist.

- [ ] **Step 3: Implement consistent backup creation**

Open source and target encrypted connections with the same password and call:

```csharp
sourceConnection.BackupDatabase(targetConnection);
```

Then open the target independently, run `PRAGMA integrity_check`, read `__EFMigrationsHistory`, and query the Projects table. Only rename the temporary file to its final `.db` name after all checks return successfully.

- [ ] **Step 4: Implement rotation and fail-safe restore**

Use filename format `gamepmer-utc-YYYYMMDD-HHmmss-<reason>.db`. Keep 14 newest distinct daily backups plus the newest backup in each of four earlier ISO weeks. Restore sequence: create verified pre-restore backup, close DbContext factory, verify selected backup, replace through a temporary file, reopen and run bootstrap checks.

- [ ] **Step 5: Implement encrypted migration packages**

`MigrationSnapshotService` serializes a deterministic logical snapshot containing schema version, projects, contacts, paths, assets, stage plans, schedule revisions, calendars, preferences, and audit events. It never exports the source DPAPI secret or SQLCipher key. Write a versioned binary envelope containing magic bytes `GPM1`, format version, 16-byte salt, 12-byte nonce, ciphertext length, ciphertext, and 16-byte authentication tag. Derive a 256-bit key with `Rfc2898DeriveBytes.Pbkdf2` using SHA-256 and 600,000 iterations, then encrypt the UTF-8 snapshot with `AesGcm`. On import, authenticate, validate every reference and schema version, create a new SQLCipher database using the target Windows user's new DPAPI-protected key, commit the snapshot once, and only then replace the active database through the fail-safe restore path. Clear derived keys and plaintext buffers with `CryptographicOperations.ZeroMemory`.

- [ ] **Step 6: Run backup and migration tests**

```powershell
dotnet test tests/GamePMer.Infrastructure.Tests --filter "FullyQualifiedName~SqliteBackupServiceTests|FullyQualifiedName~EncryptedMigrationPackageTests"
```

Expected: PASS with no direct copy of an open database and no replacement after failed package authentication.

- [ ] **Step 7: Commit**

```powershell
git add src/GamePMer.Application/Backup src/GamePMer.Infrastructure/Backup tests/GamePMer.Infrastructure.Tests/Backup
git commit -m "feat: add verified local backup and restore"
```

---

### Task 10: WPF Host, Navigation, and Safe Startup

**Files:**
- Create: `src/GamePMer.Desktop/App.xaml`
- Create: `src/GamePMer.Desktop/App.xaml.cs`
- Create: `src/GamePMer.Desktop/app.manifest`
- Create: `src/GamePMer.Desktop/Shell/MainWindow.xaml`
- Create: `src/GamePMer.Desktop/Shell/MainWindow.xaml.cs`
- Create: `src/GamePMer.Desktop/Shell/MainViewModel.cs`
- Create: `src/GamePMer.Desktop/Shell/NavigationItem.cs`
- Create: `src/GamePMer.Desktop/Shell/INavigationService.cs`
- Create: `src/GamePMer.Desktop/Shell/NavigationService.cs`
- Create: `src/GamePMer.Desktop/Shell/StartupState.cs`
- Test: `tests/GamePMer.Desktop.Tests/Shell/MainViewModelTests.cs`
- Test: `tests/GamePMer.Desktop.Tests/Shell/StartupStateTests.cs`

**Interfaces:**
- Consumes: `DatabaseBootstrapper`, application handlers.
- Produces: runnable desktop shell with safe startup states and feature navigation.

- [ ] **Step 1: Write failing navigation and startup tests**

```csharp
[Fact]
public void Default_page_is_dashboard_and_navigation_changes_content()
{
    var navigation = new FakeNavigationService();
    var vm = new MainViewModel(navigation);
    Assert.Equal("Dashboard", navigation.CurrentRoute);
    vm.NavigateCommand.Execute("Projects");
    Assert.Equal("Projects", navigation.CurrentRoute);
}

[Fact]
public async Task Database_failure_enters_recovery_state_not_empty_workspace()
{
    var bootstrapper = new FailingBootstrapper("cannot decrypt");
    var state = await StartupState.LoadAsync(bootstrapper, CancellationToken.None);
    Assert.Equal(StartupMode.Recovery, state.Mode);
    Assert.Contains("cannot decrypt", state.SafeMessage);
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Desktop.Tests --filter "FullyQualifiedName~MainViewModelTests|FullyQualifiedName~StartupStateTests"
```

Expected: FAIL because the desktop shell does not exist.

- [ ] **Step 3: Implement Generic Host composition**

```csharp
public partial class App : System.Windows.Application
{
    private IHost? _host;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        _host = Host.CreateDefaultBuilder()
            .ConfigureServices(services =>
            {
                services.AddGamePMerInfrastructure();
                services.AddSingleton<INavigationService, NavigationService>();
                services.AddSingleton<MainViewModel>();
                services.AddSingleton<MainWindow>();
            }).Build();
        await _host.StartAsync();
        var window = _host.Services.GetRequiredService<MainWindow>();
        window.Show();
    }
}
```

Before showing normal content, run `StartupState.LoadAsync`. Recovery mode exposes only backup list, restore, diagnostics path, and exit; it never creates a replacement database over an unreadable file.

- [ ] **Step 4: Implement shell navigation**

Create navigation items for Dashboard, Projects, Schedule, Import/Export, and Settings. M1 routes for Inbox, Feedback, Quote, and Closeout are visible as disabled roadmap labels rather than empty clickable pages.

- [ ] **Step 5: Run tests and launch smoke test**

```powershell
dotnet test tests/GamePMer.Desktop.Tests
dotnet run --project src/GamePMer.Desktop
```

Expected: tests PASS; app opens Dashboard, navigation changes active content, and closing exits the host cleanly.

- [ ] **Step 6: Commit**

```powershell
git add src/GamePMer.Desktop tests/GamePMer.Desktop.Tests
git commit -m "feat: add WPF application shell"
```

---

### Task 11: Project Editor and Schedule Grid

**Files:**
- Create: `src/GamePMer.Application/Projects/GetProjectDetailsQuery.cs`
- Create: `src/GamePMer.Application/Projects/ProjectDetailsDto.cs`
- Create: `src/GamePMer.Application/Projects/IProjectCommandService.cs`
- Create: `src/GamePMer.Desktop/Projects/ProjectListView.xaml`
- Create: `src/GamePMer.Desktop/Projects/ProjectListViewModel.cs`
- Create: `src/GamePMer.Desktop/Projects/ProjectEditorView.xaml`
- Create: `src/GamePMer.Desktop/Projects/ProjectEditorViewModel.cs`
- Create: `src/GamePMer.Desktop/Scheduling/ScheduleGridView.xaml`
- Create: `src/GamePMer.Desktop/Scheduling/ScheduleGridViewModel.cs`
- Test: `tests/GamePMer.Desktop.Tests/Projects/ProjectEditorViewModelTests.cs`
- Test: `tests/GamePMer.Desktop.Tests/Scheduling/ScheduleGridViewModelTests.cs`

**Interfaces:**
- Consumes: project commands/queries from Application.
- Produces: project creation, asset creation, stage schedule editing, baseline freeze, and revision form.

- [ ] **Step 1: Write failing ViewModel tests**

```csharp
[Fact]
public async Task Save_project_maps_fields_to_command_and_navigates_to_details()
{
    var commands = new RecordingProjectCommands();
    var navigation = new FakeNavigationService();
    var vm = new ProjectEditorViewModel(commands, navigation)
    {
        Code = "P-001",
        Name = "Project",
        ClientName = "Client",
        ProductionType = ProductionType.TwoD,
        CustomerFeedbackSlaDays = 2
    };

    await vm.SaveCommand.ExecuteAsync(null);

    Assert.Equal("P-001", Assert.Single(commands.Created).Code);
    Assert.StartsWith("Projects/", navigation.CurrentRoute);
}

[Fact]
public async Task Reversed_dates_keep_editor_open_and_mark_finish_error()
{
    var vm = ScheduleGridFixture.Create();
    vm.SelectedRow.CurrentStart = new DateOnly(2026, 7, 20);
    vm.SelectedRow.CurrentFinish = new DateOnly(2026, 7, 18);
    await vm.SaveRevisionCommand.ExecuteAsync(null);
    Assert.Contains("完成日期", vm.SelectedRow.Errors[nameof(vm.SelectedRow.CurrentFinish)]);
    Assert.Equal(0, vm.Commands.RevisionCount);
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Desktop.Tests --filter "FullyQualifiedName~ProjectEditorViewModelTests|FullyQualifiedName~ScheduleGridViewModelTests"
```

Expected: FAIL because the feature ViewModels do not exist.

- [ ] **Step 3: Implement editable ViewModels with explicit save**

```csharp
public partial class ProjectEditorViewModel(
    IProjectCommandService commands,
    INavigationService navigation) : ObservableValidator
{
    [ObservableProperty, Required, MinLength(2)]
    private string code = string.Empty;

    [ObservableProperty, Required]
    private string name = string.Empty;

    [ObservableProperty, Required]
    private string clientName = string.Empty;

    [ObservableProperty]
    private ProductionType productionType = ProductionType.TwoD;

    [ObservableProperty, Range(1, 30)]
    private int customerFeedbackSlaDays = 2;

    [RelayCommand]
    private async Task SaveAsync()
    {
        ValidateAllProperties();
        if (HasErrors) return;
        var result = await commands.CreateAsync(
            new(Code, Name, ClientName, ProductionType, CustomerFeedbackSlaDays));
        ApplyServerErrors(result.Errors);
        if (result.IsSuccess) navigation.Navigate($"Projects/{result.Value}");
    }
}
```

The schedule grid uses row edit drafts. Editing a cell never mutates the aggregate until `SaveRevisionCommand` succeeds. A revision requires reason and note when `Other` is selected.

The project editor also binds BD, Lead, Art Director, production path, submission path, feedback path, and final-package path. It validates email syntax and shows inaccessible paths as warnings; path warnings do not block saving because network drives can be temporarily offline.

- [ ] **Step 4: Implement virtualized XAML grids**

Use `DataGrid` with `EnableRowVirtualization="True"`, `EnableColumnVirtualization="True"`, `VirtualizingPanel.IsVirtualizing="True"`, and `VirtualizingPanel.VirtualizationMode="Recycling"`. Show baseline columns read-only and current columns editable. Actual dates are changed only through stage action commands.

- [ ] **Step 5: Run desktop tests and manual edit smoke test**

```powershell
dotnet test tests/GamePMer.Desktop.Tests
dotnet run --project src/GamePMer.Desktop
```

Expected: project can be created, assets receive correct stage rows, invalid edits remain unsaved, and a confirmed revision appears in history.

- [ ] **Step 6: Commit**

```powershell
git add src/GamePMer.Application/Projects src/GamePMer.Desktop/Projects src/GamePMer.Desktop/Scheduling tests/GamePMer.Desktop.Tests
git commit -m "feat: add project and schedule editors"
```

---

### Task 12: Exception-First Dashboard

**Files:**
- Create: `src/GamePMer.Application/Dashboard/DashboardFilter.cs`
- Create: `src/GamePMer.Application/Dashboard/DashboardSnapshot.cs`
- Create: `src/GamePMer.Application/Dashboard/ProjectStageRowDto.cs`
- Create: `src/GamePMer.Application/Dashboard/RiskItemDto.cs`
- Modify: `src/GamePMer.Application/Dashboard/GetDashboardHandler.cs`
- Create: `src/GamePMer.Desktop/Dashboard/DashboardView.xaml`
- Create: `src/GamePMer.Desktop/Dashboard/DashboardViewModel.cs`
- Create: `src/GamePMer.Desktop/Dashboard/RiskItemViewModel.cs`
- Test: `tests/GamePMer.Application.Tests/Dashboard/GetDashboardHandlerTests.cs`
- Test: `tests/GamePMer.Application.Tests/Dashboard/DashboardPerformanceTests.cs`
- Test: `tests/GamePMer.Desktop.Tests/Dashboard/DashboardViewModelTests.cs`

**Interfaces:**
- Consumes: repository query projection and `RiskEvaluator`.
- Produces: top metrics, project stage rows, sorted risk list, and filters.

- [ ] **Step 1: Write failing query and sort tests**

```csharp
[Fact]
public async Task Default_dashboard_returns_only_actionable_or_abnormal_rows()
{
    var handler = DashboardFixture.WithNormalAndRiskProjects().Handler;
    var snapshot = await handler.Handle(
        new GetDashboardQuery(DashboardFilter.Default), CancellationToken.None);
    Assert.All(snapshot.ProjectRows, row => Assert.True(row.HasActionOrRisk));
}

[Fact]
public async Task Risks_sort_by_severity_then_effective_date()
{
    var vm = DashboardViewModelFixture.Create(
        Risk(RiskKind.TMinusOne, new DateOnly(2026, 7, 17)),
        Risk(RiskKind.TeamOverdue, new DateOnly(2026, 7, 16)),
        Risk(RiskKind.ClientFeedbackOverdue, new DateOnly(2026, 7, 15)));
    await vm.RefreshCommand.ExecuteAsync(null);
    Assert.Equal(RiskKind.TeamOverdue, vm.Risks[0].Kind);
    Assert.Equal(RiskKind.ClientFeedbackOverdue, vm.Risks[1].Kind);
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Application.Tests --filter FullyQualifiedName~GetDashboardHandlerTests
dotnet test tests/GamePMer.Desktop.Tests --filter FullyQualifiedName~DashboardViewModelTests
```

Expected: FAIL because dashboard DTOs and sorting do not exist.

- [ ] **Step 3: Implement one read model query**

```csharp
public sealed record DashboardSnapshot(
    int ActionCount,
    int TMinusOneCount,
    int OverdueCount,
    int AwaitingClientCount,
    IReadOnlyList<ProjectStageRowDto> ProjectRows,
    IReadOnlyList<RiskItemDto> Risks,
    DateTimeOffset GeneratedAt);
```

Project rows include project code/name, asset code/name, current stage name, baseline/current finish, status, reason, and a compact list of stage states. The default filter excludes rows with no action and no risk.

- [ ] **Step 4: Implement confirmed hybrid layout**

Use two compact metric groups at the top, a virtualized stage-row list in the center, and risk actions below. Each color-coded state also displays a text label. Clicking a row navigates to `Projects/{projectId}/Assets/{assetId}`.

- [ ] **Step 5: Run tests and high-volume projection check**

```powershell
dotnet test tests/GamePMer.Application.Tests
dotnet test tests/GamePMer.Desktop.Tests
dotnet test tests/GamePMer.Application.Tests --filter FullyQualifiedName~DashboardPerformanceTests
```

Add `DashboardPerformanceTests` with 20 projects, 5,000 assets, and 30,000 stage plans. Expected: snapshot generation under 500 ms on the CI runner after one warm-up iteration; the test logs elapsed time and fails above 1,500 ms to reduce CI noise while preserving a regression ceiling.

- [ ] **Step 6: Commit**

```powershell
git add src/GamePMer.Application/Dashboard src/GamePMer.Desktop/Dashboard tests
git commit -m "feat: add exception-first project dashboard"
```

---

### Task 13: Gantt Timeline with Confirmed Manual Replanning

**Files:**
- Create: `src/GamePMer.Desktop/Scheduling/Gantt/GanttView.xaml`
- Create: `src/GamePMer.Desktop/Scheduling/Gantt/GanttViewModel.cs`
- Create: `src/GamePMer.Desktop/Scheduling/Gantt/GanttRowViewModel.cs`
- Create: `src/GamePMer.Desktop/Scheduling/Gantt/GanttBarViewModel.cs`
- Create: `src/GamePMer.Desktop/Scheduling/Gantt/GanttDragBehavior.cs`
- Create: `src/GamePMer.Desktop/Scheduling/Gantt/ScheduleMoveDraft.cs`
- Create: `src/GamePMer.Desktop/Scheduling/Gantt/RevisionConfirmationView.xaml`
- Create: `src/GamePMer.Desktop/Scheduling/Gantt/RevisionConfirmationViewModel.cs`
- Test: `tests/GamePMer.Desktop.Tests/Scheduling/GanttViewModelTests.cs`
- Test: `tests/GamePMer.Desktop.Tests/Scheduling/GanttDragBehaviorTests.cs`

**Interfaces:**
- Consumes: `ReviseScheduleCommand`, WorkCalendar query.
- Produces: virtualized timeline; drag creates a draft and never persists without confirmation.

- [ ] **Step 1: Write failing drag-draft tests**

```csharp
[Fact]
public void Drag_across_weekend_moves_by_workdays_not_pixels_as_calendar_days()
{
    var bar = GanttFixture.Bar(
        start: new DateOnly(2026, 7, 17),
        finish: new DateOnly(2026, 7, 20));
    var draft = bar.ProposeMove(workdayDelta: 1, GanttFixture.StandardCalendar);
    Assert.Equal(new DateOnly(2026, 7, 20), draft.NewStart);
    Assert.Equal(new DateOnly(2026, 7, 21), draft.NewFinish);
}

[Fact]
public async Task Cancelling_confirmation_does_not_send_revision_command()
{
    var fixture = GanttViewModelFixture.Create();
    fixture.ViewModel.StageMoveProposed(fixture.MoveDraft);
    fixture.ViewModel.CancelRevisionCommand.Execute(null);
    Assert.Equal(0, fixture.Commands.RevisionCount);
    Assert.Equal(fixture.MoveDraft.OldStart, fixture.ViewModel.FindBar().Start);
}

[Fact]
public async Task Confirming_requires_reason_and_persists_once()
{
    var fixture = GanttViewModelFixture.Create();
    fixture.ViewModel.StageMoveProposed(fixture.MoveDraft);
    fixture.ViewModel.RevisionReason = ScheduleReasonCode.ClientFeedbackDelay;
    await fixture.ViewModel.ConfirmRevisionCommand.ExecuteAsync(null);
    Assert.Equal(1, fixture.Commands.RevisionCount);
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Desktop.Tests --filter "FullyQualifiedName~GanttViewModelTests|FullyQualifiedName~GanttDragBehaviorTests"
```

Expected: FAIL because timeline models do not exist.

- [ ] **Step 3: Implement workday-based move drafts**

```csharp
public sealed record ScheduleMoveDraft(
    Guid StagePlanId,
    DateOnly OldStart,
    DateOnly OldFinish,
    DateOnly NewStart,
    DateOnly NewFinish);

public ScheduleMoveDraft ProposeMove(int workdayDelta, WorkCalendar calendar)
{
    var newStart = calendar.MoveByWorkdays(Start, workdayDelta);
    var duration = calendar.CountWorkdays(Start, Finish);
    var newFinish = calendar.AddWorkdays(newStart, duration);
    return new(Id, Start, Finish, newStart, newFinish);
}
```

Add `MoveByWorkdays(DateOnly, int)` to WorkCalendar with positive and negative tests:

```csharp
public DateOnly MoveByWorkdays(DateOnly date, int delta)
{
    if (delta == 0) return IsWorkday(date) ? date : AddWorkdays(date, 1);
    var direction = Math.Sign(delta);
    var remaining = Math.Abs(delta);
    var candidate = date;
    while (remaining > 0)
    {
        candidate = candidate.AddDays(direction);
        if (IsWorkday(candidate)) remaining--;
    }
    return candidate;
}
```

Pixel delta converts to whole workdays using the current zoom scale; partial pixels do not mutate dates until the threshold is crossed.

- [ ] **Step 4: Implement timeline rendering and confirmation panel**

Render the date axis and bars with an `ItemsControl` inside a virtualized row list. Baseline appears as a thin reference bar; current schedule appears as the interactive bar; actual range appears only when present. Dragging opens the revision panel with old/new dates, affected downstream stages, reason and note.

- [ ] **Step 5: Run tests and manual interaction check**

```powershell
dotnet test tests/GamePMer.Domain.Tests
dotnet test tests/GamePMer.Desktop.Tests
dotnet run --project src/GamePMer.Desktop
```

Expected: weekend-aware moves, cancel reverts display, confirm writes one revision, downstream dates remain unchanged and become flagged.

- [ ] **Step 6: Commit**

```powershell
git add src/GamePMer.Domain/Scheduling src/GamePMer.Desktop/Scheduling/Gantt tests
git commit -m "feat: add confirmed gantt schedule editing"
```

---

### Task 14: User Settings, Digest Scheduler, and Desktop Alerts

**Files:**
- Create: `src/GamePMer.Application/Settings/UserPreferences.cs`
- Create: `src/GamePMer.Application/Settings/IUserPreferencesStore.cs`
- Create: `src/GamePMer.Application/Notifications/INotificationSink.cs`
- Create: `src/GamePMer.Application/Notifications/DigestScheduler.cs`
- Create: `src/GamePMer.Infrastructure/Settings/JsonUserPreferencesStore.cs`
- Create: `src/GamePMer.Desktop/Notifications/TrayNotificationSink.cs`
- Create: `src/GamePMer.Desktop/Settings/SettingsView.xaml`
- Create: `src/GamePMer.Desktop/Settings/SettingsViewModel.cs`
- Create: `src/GamePMer.Desktop/Settings/WorkCalendarEditorView.xaml`
- Create: `src/GamePMer.Desktop/Settings/WorkCalendarEditorViewModel.cs`
- Test: `tests/GamePMer.Application.Tests/Notifications/DigestSchedulerTests.cs`
- Test: `tests/GamePMer.Desktop.Tests/Settings/SettingsViewModelTests.cs`

**Interfaces:**
- Consumes: dashboard risks, IClock, user preferences.
- Produces: immediate high-risk alerts, configurable digest times, calendar editor, and backup settings.

- [ ] **Step 1: Write failing scheduler tests**

```csharp
[Fact]
public async Task High_risk_is_sent_immediately_once()
{
    var sink = new RecordingNotificationSink();
    var scheduler = SchedulerFixture.Create(sink, now: "2026-07-15T09:10:00+08:00");
    await scheduler.ProcessAsync([Risk.TeamOverdue("risk-1")], CancellationToken.None);
    await scheduler.ProcessAsync([Risk.TeamOverdue("risk-1")], CancellationToken.None);
    Assert.Single(sink.Immediate);
}

[Fact]
public async Task Ordinary_items_wait_until_configured_digest_time()
{
    var sink = new RecordingNotificationSink();
    var scheduler = SchedulerFixture.Create(
        sink, now: "2026-07-15T09:10:00+08:00", digestTimes: [new(10, 0)]);
    await scheduler.EnqueueOrdinaryAsync(ActionItem.Sample(), CancellationToken.None);
    Assert.Empty(sink.Digests);
    scheduler.Clock.Advance(TimeSpan.FromMinutes(50));
    await scheduler.TickAsync(CancellationToken.None);
    Assert.Single(sink.Digests);
}
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
dotnet test tests/GamePMer.Application.Tests --filter FullyQualifiedName~DigestSchedulerTests
```

Expected: FAIL because preferences and scheduler do not exist.

- [ ] **Step 3: Implement preferences and idempotent scheduler**

```csharp
public sealed record UserPreferences(
    IReadOnlyList<TimeOnly> DigestTimes,
    bool StartWithWindows,
    bool MinimizeToTray,
    string BackupDirectory,
    int DailyBackups,
    int WeeklyBackups)
{
    public static UserPreferences Default(string backupDirectory) =>
        new([new(9, 0), new(14, 0), new(17, 30)], false, true,
            backupDirectory, 14, 4);
}
```

The scheduler persists notification keys so restart does not repeat an immediate alert. Digest entries remain queued until `INotificationSink` reports success.

- [ ] **Step 4: Implement local settings and tray notifications**

Store non-sensitive preferences as versioned JSON under `%LOCALAPPDATA%\GamePMer\settings.json` using write-to-temp plus atomic replace. Implement `TrayNotificationSink` with `System.Windows.Forms.NotifyIcon`; clicking a notification activates the WPF window and navigates to the risk entity.

- [ ] **Step 5: Implement settings and calendar editor**

The settings page edits digest times, startup behavior, backup path/retention, and company calendar overrides. Saving calendar changes recalculates risks but does not change any schedule date automatically.

- [ ] **Step 6: Run scheduler and ViewModel tests**

```powershell
dotnet test tests/GamePMer.Application.Tests --filter FullyQualifiedName~DigestSchedulerTests
dotnet test tests/GamePMer.Desktop.Tests --filter FullyQualifiedName~SettingsViewModelTests
```

Expected: PASS; alerts are idempotent and ordinary items wait for configured times.

- [ ] **Step 7: Commit**

```powershell
git add src/GamePMer.Application/Settings src/GamePMer.Application/Notifications src/GamePMer.Infrastructure/Settings src/GamePMer.Desktop/Settings src/GamePMer.Desktop/Notifications tests
git commit -m "feat: add configurable alerts and work calendar settings"
```

---

### Task 15: M1 Acceptance Scenario, CI, and Self-Contained Build

**Files:**
- Create: `tests/GamePMer.AcceptanceTests/M1ScheduleControlTowerScenario.cs`
- Create: `tests/GamePMer.AcceptanceTests/AcceptanceFixture.cs`
- Create: `docs/TESTING.md`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed M1 application and infrastructure composition.
- Produces: one repeatable end-to-end acceptance scenario, Windows CI, and publish artifact.

- [ ] **Step 1: Write the failing M1 acceptance scenario**

```csharp
[Fact]
public async Task Imported_schedule_can_be_replanned_risked_exported_and_restored()
{
    using var app = await AcceptanceFixture.StartAsync(today: new DateOnly(2026, 7, 15));
    var workbook = app.CreateWorkbookWithTwoDAndThreeDProjects();

    var preview = await app.PreviewImportAsync(workbook);
    Assert.True(preview.CanCommit);
    await app.CommitImportAsync(preview);
    await app.FreezeAllBaselinesAsync();

    var stage = await app.FindStageAsync("P-3D", "MECH-01", "3D_HIGH");
    await app.ReviseAsync(stage.Id,
        new DateOnly(2026, 7, 16), new DateOnly(2026, 7, 20),
        ScheduleReasonCode.ClientFeedbackDelay, "客户反馈晚 2 个工作日");

    var dashboard = await app.GetDashboardAsync();
    Assert.Contains(dashboard.Risks,
        x => x.Kind == RiskKind.ScheduleRevisionRequired && x.ProjectCode == "P-3D");

    var exportPath = await app.ExportAsync();
    Assert.True(File.Exists(exportPath));
    var backup = await app.CreateBackupAsync();
    await app.DeleteProjectForRestoreTestAsync("P-3D");
    await app.RestoreAsync(backup.Id);
    Assert.NotNull(await app.FindProjectAsync("P-3D"));
}
```

- [ ] **Step 2: Run the acceptance test and confirm failure**

```powershell
dotnet test tests/GamePMer.AcceptanceTests --filter FullyQualifiedName~M1ScheduleControlTowerScenario
```

Expected: FAIL until all M1 composition methods are wired through the same host used by Desktop.

- [ ] **Step 3: Wire acceptance composition and pass the scenario**

`AcceptanceFixture` creates a temporary `%LOCALAPPDATA%` equivalent, DPAPI-protected test key, encrypted database, fixed clock, real ClosedXML service, real backup service, and Application handlers. It does not automate WPF controls; ViewModel behavior is covered separately.

Run:

```powershell
dotnet test tests/GamePMer.AcceptanceTests
```

Expected: PASS.

- [ ] **Step 4: Add Windows GitHub Actions workflow**

```yaml
name: ci

on:
  push:
    branches: [main]
  pull_request:

jobs:
  build-test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'
      - run: dotnet restore GamePMer.slnx
      - run: dotnet format GamePMer.slnx --verify-no-changes --no-restore
      - run: dotnet build GamePMer.slnx -c Release --no-restore
      - run: dotnet test GamePMer.slnx -c Release --no-build --collect:"XPlat Code Coverage"
      - run: dotnet publish src/GamePMer.Desktop -c Release -r win-x64 --self-contained true -o artifacts/win-x64
      - uses: actions/upload-artifact@v4
        with:
          name: GamePMer-win-x64
          path: artifacts/win-x64
```

- [ ] **Step 5: Document verification commands and privacy rules**

`docs/TESTING.md` must contain the exact restore/build/test/publish commands, the M1 manual scenario, database encryption inspection, backup restore drill, and a checklist that forbids real customer names, messages, screenshots, paths, email addresses, API keys, databases, logs, and `.pfx` files in commits.

- [ ] **Step 6: Run final M1 verification from a clean checkout**

```powershell
dotnet restore GamePMer.slnx
dotnet format GamePMer.slnx --verify-no-changes --no-restore
dotnet build GamePMer.slnx -c Release --no-restore
dotnet test GamePMer.slnx -c Release --no-build
dotnet publish src/GamePMer.Desktop -c Release -r win-x64 --self-contained true -o artifacts/win-x64
```

Expected: every command exits 0; acceptance scenario passes; `artifacts/win-x64/GamePMer.Desktop.exe` launches on a non-development Windows test machine.

- [ ] **Step 7: Commit**

```powershell
git add tests/GamePMer.AcceptanceTests docs/TESTING.md .github/workflows/ci.yml README.md
git commit -m "test: verify M1 schedule control tower"
```

---

## Plan Self-Review Checklist

- [ ] Every M1 PRD requirement maps to at least one task: foundation, calendars, project/stage model, schedule revisions, risks, persistence, Excel, backup, shell, editor, dashboard, Gantt, notifications, acceptance, and CI.
- [ ] All package versions are pinned centrally and match .NET 10 / EF Core 10.
- [ ] Domain/Application contain no Windows or infrastructure dependency.
- [ ] Every business mutation has a failing test, minimal implementation step, passing command, and commit.
- [ ] Baseline immutability, customer stage gate, no automatic replan, T-1 workday logic, delay attribution, encrypted database, and verified restore are explicitly tested.
- [ ] No M2–M5 connector or workflow is accidentally implemented in M1.

## Deferred Milestone Plans

After M1 is verified with real schedule data, create separate implementation plans in this order:

1. M2 Outlook and AI candidate inbox.
2. M3 feedback center and approved chat connectors.
3. M4 quote, change-request, closeout, IT backup, and BD billing notification workflow.
4. M5 analytics, MSIX signing, trial distribution, and GitHub release hardening.

Each plan must reuse the ports and project identifiers defined here and must begin with the corresponding PRD acceptance criteria.

