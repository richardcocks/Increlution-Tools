using IncrelutionAutomationEditor.Api.Data;
using IncrelutionAutomationEditor.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace IncrelutionAutomationEditor.Api.Services;

public class FolderService
{
    /// <summary>
    /// Checks if a folder or any of its ancestors is read-only.
    /// </summary>
    public bool IsFolderOrAncestorReadOnly(List<Folder> allFolders, int folderId)
    {
        int? currentId = folderId;
        while (currentId != null)
        {
            var folder = allFolders.FirstOrDefault(f => f.Id == currentId);
            if (folder == null) break;
            if (folder.IsReadOnly) return true;
            currentId = folder.ParentId;
        }
        return false;
    }

    /// <summary>
    /// Generates a copy name following the pattern: "Name (copy)", "Name (copy) (2)", "Name (copy) (3)", etc.
    /// </summary>
    public string GenerateCopyName(string originalName, int maxLength = 100)
    {
        const string copySuffix = " (copy)";
        const string copyPattern = " (copy) (";

        // Check if name already ends with " (copy)" or " (copy) (N)"
        if (originalName.EndsWith(copySuffix))
        {
            // Convert "Name (copy)" to "Name (copy) (2)"
            var baseName = originalName;
            var newName = $"{baseName} (2)";
            if (newName.Length > maxLength)
            {
                var excess = newName.Length - maxLength;
                baseName = baseName[..^excess];
                newName = $"{baseName} (2)";
            }
            return newName;
        }

        var copyIndex = originalName.LastIndexOf(copyPattern);
        if (copyIndex >= 0)
        {
            // Extract the number and increment
            var afterPattern = originalName[(copyIndex + copyPattern.Length)..];
            var closeParenIndex = afterPattern.IndexOf(')');
            if (closeParenIndex > 0 && closeParenIndex == afterPattern.Length - 1)
            {
                var numberStr = afterPattern[..closeParenIndex];
                if (int.TryParse(numberStr, out var num))
                {
                    var baseName = originalName[..(copyIndex + copySuffix.Length)];
                    var newName = $"{baseName} ({num + 1})";
                    if (newName.Length > maxLength)
                    {
                        var excess = newName.Length - maxLength;
                        baseName = baseName[..^excess];
                        newName = $"{baseName} ({num + 1})";
                    }
                    return newName;
                }
            }
        }

        // Just append " (copy)"
        var result = originalName + copySuffix;
        if (result.Length > maxLength)
        {
            var excess = result.Length - maxLength;
            result = originalName[..^excess] + copySuffix;
        }
        return result;
    }

    /// <summary>
    /// Loads all folders belonging to a user.
    /// </summary>
    public async Task<List<Folder>> GetUserFoldersAsync(AppDbContext db, int userId)
    {
        return await db.Folders.Where(f => f.UserId == userId).ToListAsync();
    }

    /// <summary>
    /// Counts the depth of a folder from root by traversing ancestors.
    /// </summary>
    public int GetDepth(List<Folder> allFolders, int? parentId)
    {
        int depth = 0;
        while (parentId != null)
        {
            depth++;
            var parent = allFolders.FirstOrDefault(f => f.Id == parentId);
            parentId = parent?.ParentId;
        }
        return depth;
    }

    /// <summary>
    /// Gets the maximum depth of subfolders below the given folder.
    /// </summary>
    public int GetMaxSubfolderDepth(List<Folder> allFolders, int folderId)
    {
        int maxDepth = 0;
        var subfolders = allFolders.Where(f => f.ParentId == folderId).ToList();
        foreach (var sub in subfolders)
        {
            var subDepth = 1 + GetMaxSubfolderDepth(allFolders, sub.Id);
            if (subDepth > maxDepth) maxDepth = subDepth;
        }
        return maxDepth;
    }

    /// <summary>
    /// Counts folders recursively from a given root (inclusive).
    /// </summary>
    public int CountFoldersRecursive(List<Folder> allFolders, int folderId)
    {
        var subFolders = allFolders.Where(f => f.ParentId == folderId).ToList();
        return 1 + subFolders.Sum(f => CountFoldersRecursive(allFolders, f.Id));
    }

    /// <summary>
    /// Counts loadouts recursively under a folder tree.
    /// </summary>
    public int CountLoadoutsRecursive(List<Folder> allFolders, List<Loadout> allLoadouts, int folderId)
    {
        var folderLoadouts = allLoadouts.Count(l => l.FolderId == folderId);
        var subFolders = allFolders.Where(f => f.ParentId == folderId).ToList();
        return folderLoadouts + subFolders.Sum(f => CountLoadoutsRecursive(allFolders, allLoadouts, f.Id));
    }

    /// <summary>
    /// Recursively duplicates a folder and all its contents (subfolders + loadouts).
    /// Returns the new root folder and count of items copied.
    /// </summary>
    public async Task<DuplicateResult> DuplicateFolderRecursiveAsync(
        AppDbContext db,
        List<Folder> allFolders,
        List<Loadout> allLoadouts,
        int sourceFolderId,
        int? targetParentId,
        int userId,
        bool isTopLevel,
        int sortOrder)
    {
        var result = new DuplicateResult();
        var sourceFolder = allFolders.First(f => f.Id == sourceFolderId);

        var newFolder = new Folder
        {
            Name = isTopLevel ? GenerateCopyName(sourceFolder.Name) : sourceFolder.Name,
            ParentId = targetParentId,
            UserId = userId,
            CreatedAt = DateTime.UtcNow,
            SortOrder = sortOrder
        };
        db.Folders.Add(newFolder);
        await db.SaveChangesAsync();
        result.FoldersCopied++;
        result.RootFolder = newFolder;

        // Duplicate loadouts in this folder (preserving sort order)
        var folderLoadouts = allLoadouts.Where(l => l.FolderId == sourceFolderId).OrderBy(l => l.SortOrder).ToList();
        foreach (var loadout in folderLoadouts)
        {
            var newLoadout = new Loadout
            {
                Name = loadout.Name,
                FolderId = newFolder.Id,
                UserId = userId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                Data = loadout.Data,
                IsProtected = false,
                SortOrder = loadout.SortOrder
            };
            db.Loadouts.Add(newLoadout);
            result.LoadoutsCopied++;
        }
        await db.SaveChangesAsync();

        // Duplicate subfolders (preserving sort order)
        var subFolders = allFolders.Where(f => f.ParentId == sourceFolderId).OrderBy(f => f.SortOrder).ToList();
        foreach (var subFolder in subFolders)
        {
            var subResult = await DuplicateFolderRecursiveAsync(
                db, allFolders, allLoadouts, subFolder.Id, newFolder.Id, userId, false, subFolder.SortOrder);
            result.FoldersCopied += subResult.FoldersCopied;
            result.LoadoutsCopied += subResult.LoadoutsCopied;
        }

        return result;
    }
}

public class DuplicateResult
{
    public Folder RootFolder { get; set; } = null!;
    public int FoldersCopied { get; set; }
    public int LoadoutsCopied { get; set; }
}
