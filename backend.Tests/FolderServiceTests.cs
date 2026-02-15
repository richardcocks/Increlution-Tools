using IncrelutionAutomationEditor.Api.Models;
using IncrelutionAutomationEditor.Api.Services;

namespace IncrelutionAutomationEditor.Tests;

public class FolderServiceTests
{
    private readonly FolderService _sut = new();

    #region IsFolderOrAncestorReadOnly

    [Fact]
    public void IsFolderOrAncestorReadOnly_ReturnsFalse_WhenFolderIsWritable()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null, IsReadOnly = false }
        };
        Assert.False(_sut.IsFolderOrAncestorReadOnly(folders, 1));
    }

    [Fact]
    public void IsFolderOrAncestorReadOnly_ReturnsTrue_WhenFolderIsReadOnly()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null, IsReadOnly = true }
        };
        Assert.True(_sut.IsFolderOrAncestorReadOnly(folders, 1));
    }

    [Fact]
    public void IsFolderOrAncestorReadOnly_ReturnsTrue_WhenAncestorIsReadOnly()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null, IsReadOnly = true },
            new() { Id = 2, Name = "Child", ParentId = 1, IsReadOnly = false },
            new() { Id = 3, Name = "Grandchild", ParentId = 2, IsReadOnly = false },
        };
        Assert.True(_sut.IsFolderOrAncestorReadOnly(folders, 3));
    }

    [Fact]
    public void IsFolderOrAncestorReadOnly_ReturnsFalse_WhenNoAncestorsReadOnly()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null, IsReadOnly = false },
            new() { Id = 2, Name = "Child", ParentId = 1, IsReadOnly = false },
            new() { Id = 3, Name = "Grandchild", ParentId = 2, IsReadOnly = false },
        };
        Assert.False(_sut.IsFolderOrAncestorReadOnly(folders, 3));
    }

    [Fact]
    public void IsFolderOrAncestorReadOnly_ReturnsFalse_WhenFolderNotFound()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null, IsReadOnly = false }
        };
        Assert.False(_sut.IsFolderOrAncestorReadOnly(folders, 999));
    }

    #endregion

    #region GenerateCopyName

    [Fact]
    public void GenerateCopyName_AppendsCoySuffix()
    {
        Assert.Equal("My Folder (copy)", _sut.GenerateCopyName("My Folder"));
    }

    [Fact]
    public void GenerateCopyName_IncrementsCopyTo2()
    {
        Assert.Equal("My Folder (copy) (2)", _sut.GenerateCopyName("My Folder (copy)"));
    }

    [Fact]
    public void GenerateCopyName_IncrementsNumber()
    {
        Assert.Equal("My Folder (copy) (3)", _sut.GenerateCopyName("My Folder (copy) (2)"));
        Assert.Equal("My Folder (copy) (10)", _sut.GenerateCopyName("My Folder (copy) (9)"));
    }

    [Fact]
    public void GenerateCopyName_TruncatesWhenExceedingMaxLength()
    {
        var longName = new string('A', 95);
        var result = _sut.GenerateCopyName(longName, 100);
        Assert.True(result.Length <= 100);
        Assert.EndsWith(" (copy)", result);
    }

    [Fact]
    public void GenerateCopyName_HandlesEmptyString()
    {
        Assert.Equal(" (copy)", _sut.GenerateCopyName(""));
    }

    #endregion

    #region GetDepth

    [Fact]
    public void GetDepth_ReturnsZero_ForRootFolder()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null }
        };
        Assert.Equal(0, _sut.GetDepth(folders, null));
    }

    [Fact]
    public void GetDepth_ReturnsCorrectDepth_ForNestedFolders()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null },
            new() { Id = 2, Name = "Level 1", ParentId = 1 },
            new() { Id = 3, Name = "Level 2", ParentId = 2 },
        };
        Assert.Equal(2, _sut.GetDepth(folders, 2)); // parent of folder 3 is folder 2
    }

    #endregion

    #region GetMaxSubfolderDepth

    [Fact]
    public void GetMaxSubfolderDepth_ReturnsZero_ForLeaf()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null }
        };
        Assert.Equal(0, _sut.GetMaxSubfolderDepth(folders, 1));
    }

    [Fact]
    public void GetMaxSubfolderDepth_ReturnsCorrectDepth()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null },
            new() { Id = 2, Name = "A", ParentId = 1 },
            new() { Id = 3, Name = "B", ParentId = 1 },
            new() { Id = 4, Name = "A1", ParentId = 2 },
            new() { Id = 5, Name = "A1a", ParentId = 4 },
        };
        // Root -> A -> A1 -> A1a = depth 3, Root -> B = depth 1
        Assert.Equal(3, _sut.GetMaxSubfolderDepth(folders, 1));
    }

    #endregion

    #region CountFoldersRecursive

    [Fact]
    public void CountFoldersRecursive_CountsSelfAndChildren()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null },
            new() { Id = 2, Name = "A", ParentId = 1 },
            new() { Id = 3, Name = "B", ParentId = 1 },
            new() { Id = 4, Name = "A1", ParentId = 2 },
        };
        Assert.Equal(4, _sut.CountFoldersRecursive(folders, 1));
        Assert.Equal(2, _sut.CountFoldersRecursive(folders, 2));
        Assert.Equal(1, _sut.CountFoldersRecursive(folders, 3));
    }

    #endregion

    #region CountLoadoutsRecursive

    [Fact]
    public void CountLoadoutsRecursive_CountsAcrossSubfolders()
    {
        var folders = new List<Folder>
        {
            new() { Id = 1, Name = "Root", ParentId = null },
            new() { Id = 2, Name = "A", ParentId = 1 },
        };
        var loadouts = new List<Loadout>
        {
            new() { Id = 1, Name = "L1", FolderId = 1 },
            new() { Id = 2, Name = "L2", FolderId = 1 },
            new() { Id = 3, Name = "L3", FolderId = 2 },
        };
        Assert.Equal(3, _sut.CountLoadoutsRecursive(folders, loadouts, 1));
        Assert.Equal(1, _sut.CountLoadoutsRecursive(folders, loadouts, 2));
    }

    #endregion
}
