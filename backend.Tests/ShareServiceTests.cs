using IncrelutionAutomationEditor.Api.DTOs;
using IncrelutionAutomationEditor.Api.Models;
using IncrelutionAutomationEditor.Api.Services;

namespace IncrelutionAutomationEditor.Tests;

public class ShareServiceTests
{
    private readonly ShareService _sut = new();

    #region GenerateShareToken

    [Fact]
    public void GenerateShareToken_Returns16Characters()
    {
        var token = _sut.GenerateShareToken();
        Assert.Equal(16, token.Length);
    }

    [Fact]
    public void GenerateShareToken_ContainsOnlyAlphanumericChars()
    {
        var token = _sut.GenerateShareToken();
        Assert.Matches("^[A-Za-z0-9]+$", token);
    }

    [Fact]
    public void GenerateShareToken_GeneratesUniqueTokens()
    {
        var tokens = Enumerable.Range(0, 100).Select(_ => _sut.GenerateShareToken()).ToHashSet();
        Assert.Equal(100, tokens.Count);
    }

    #endregion

    #region IsShareExpired

    [Fact]
    public void IsShareExpired_ReturnsFalse_WhenNull()
    {
        Assert.False(_sut.IsShareExpired(null));
    }

    [Fact]
    public void IsShareExpired_ReturnsFalse_WhenInFuture()
    {
        Assert.False(_sut.IsShareExpired(DateTime.UtcNow.AddHours(1)));
    }

    [Fact]
    public void IsShareExpired_ReturnsTrue_WhenInPast()
    {
        Assert.True(_sut.IsShareExpired(DateTime.UtcNow.AddHours(-1)));
    }

    #endregion

    #region FilterLoadoutByChapters

    [Fact]
    public void FilterLoadoutByChapters_KeepsUnlockedChapterActions()
    {
        var data = new LoadoutData
        {
            [0] = new Dictionary<int, int?> { [0] = 3, [1] = 2 }
        };
        var actions = new List<IncrelutionAction>
        {
            new() { Id = 0, OriginalId = 0, Name = "A", Icon = "", Type = 0, Chapter = 0, SortOrder = 0 },
            new() { Id = 1, OriginalId = 1, Name = "B", Icon = "", Type = 0, Chapter = 1, SortOrder = 1 },
        };
        var unlocked = new HashSet<int> { 0 };

        var result = _sut.FilterLoadoutByChapters(data, actions, unlocked);

        Assert.Single(result[0]);
        Assert.Equal(3, result[0][0]);
    }

    [Fact]
    public void FilterLoadoutByChapters_KeepsActionsWithNoChapterLookup()
    {
        var data = new LoadoutData
        {
            [0] = new Dictionary<int, int?> { [99] = 4 }
        };
        var actions = new List<IncrelutionAction>(); // No actions known
        var unlocked = new HashSet<int> { 0 };

        var result = _sut.FilterLoadoutByChapters(data, actions, unlocked);

        // Action 99 has no chapter info, so it should be included
        Assert.Equal(4, result[0][99]);
    }

    [Fact]
    public void FilterLoadoutByChapters_PreservesNullAutomationLevels()
    {
        var data = new LoadoutData
        {
            [0] = new Dictionary<int, int?> { [0] = null }
        };
        var actions = new List<IncrelutionAction>
        {
            new() { Id = 0, OriginalId = 0, Name = "A", Icon = "", Type = 0, Chapter = 0, SortOrder = 0 },
        };
        var unlocked = new HashSet<int> { 0 };

        var result = _sut.FilterLoadoutByChapters(data, actions, unlocked);

        Assert.Null(result[0][0]);
    }

    [Fact]
    public void FilterLoadoutByChapters_FiltersMultipleTypes()
    {
        var data = new LoadoutData
        {
            [0] = new Dictionary<int, int?> { [0] = 3 },
            [1] = new Dictionary<int, int?> { [0] = 2 },
            [2] = new Dictionary<int, int?> { [0] = 1 },
        };
        var actions = new List<IncrelutionAction>
        {
            new() { Id = 0, OriginalId = 0, Name = "Job", Icon = "", Type = 0, Chapter = 0, SortOrder = 0 },
            new() { Id = 10000, OriginalId = 0, Name = "Build", Icon = "", Type = 1, Chapter = 1, SortOrder = 0 },
            new() { Id = 20000, OriginalId = 0, Name = "Explore", Icon = "", Type = 2, Chapter = 0, SortOrder = 0 },
        };
        var unlocked = new HashSet<int> { 0 };

        var result = _sut.FilterLoadoutByChapters(data, actions, unlocked);

        Assert.Single(result[0]); // Job ch0 kept
        Assert.Empty(result[1]); // Build ch1 filtered
        Assert.Single(result[2]); // Explore ch0 kept
    }

    #endregion

    #region CollectFolderIds

    [Fact]
    public void CollectFolderIds_CollectsRootAndDescendants()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null },
            new() { Id = 2, Name = "A", ParentId = 1 },
            new() { Id = 3, Name = "B", ParentId = 1 },
            new() { Id = 4, Name = "A1", ParentId = 2 },
        };
        var result = _sut.CollectFolderIds(1, folders);
        Assert.Equal(new HashSet<int> { 1, 2, 3, 4 }, result);
    }

    [Fact]
    public void CollectFolderIds_CollectsSubtreeOnly()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null },
            new() { Id = 2, Name = "A", ParentId = 1 },
            new() { Id = 3, Name = "B", ParentId = 1 },
            new() { Id = 4, Name = "A1", ParentId = 2 },
        };
        var result = _sut.CollectFolderIds(2, folders);
        Assert.Equal(new HashSet<int> { 2, 4 }, result);
    }

    [Fact]
    public void CollectFolderIds_ReturnsSingleForLeaf()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null },
            new() { Id = 2, Name = "Leaf", ParentId = 1 },
        };
        var result = _sut.CollectFolderIds(2, folders);
        Assert.Equal(new HashSet<int> { 2 }, result);
    }

    #endregion
}
