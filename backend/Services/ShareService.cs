using System.Security.Cryptography;
using IncrelutionAutomationEditor.Api.DTOs;
using IncrelutionAutomationEditor.Api.Models;

namespace IncrelutionAutomationEditor.Api.Services;

public class ShareService
{
    /// <summary>
    /// Generates a cryptographically random 16-character alphanumeric share token.
    /// </summary>
    public string GenerateShareToken()
    {
        const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        var data = new byte[16];
        RandomNumberGenerator.Fill(data);
        var result = new char[16];
        for (int i = 0; i < 16; i++)
        {
            result[i] = chars[data[i] % chars.Length];
        }
        return new string(result);
    }

    /// <summary>
    /// Checks whether a share has expired.
    /// </summary>
    public bool IsShareExpired(DateTime? expiresAt)
    {
        return expiresAt.HasValue && expiresAt.Value < DateTime.UtcNow;
    }

    /// <summary>
    /// Filters loadout data to only include actions from unlocked chapters.
    /// </summary>
    public LoadoutData FilterLoadoutByChapters(
        LoadoutData data,
        IEnumerable<IncrelutionAction> actions,
        HashSet<int> unlockedChapters)
    {
        // Build lookup: type -> originalId -> chapter
        var chapterLookup = new Dictionary<int, Dictionary<int, int>>();
        foreach (var action in actions)
        {
            if (!chapterLookup.ContainsKey(action.Type))
                chapterLookup[action.Type] = new Dictionary<int, int>();
            chapterLookup[action.Type][action.OriginalId] = action.Chapter;
        }

        var result = new LoadoutData();
        foreach (var (actionType, typeData) in data)
        {
            result[actionType] = new Dictionary<int, int?>();
            if (!chapterLookup.TryGetValue(actionType, out var typeLookup))
            {
                // No actions for this type, include all
                foreach (var (originalId, level) in typeData)
                    result[actionType][originalId] = level;
                continue;
            }

            foreach (var (originalId, level) in typeData)
            {
                // Only include if chapter is unlocked (or if we can't find chapter info)
                if (!typeLookup.TryGetValue(originalId, out var chapter) || unlockedChapters.Contains(chapter))
                {
                    result[actionType][originalId] = level;
                }
            }
        }
        return result;
    }

    /// <summary>
    /// Collects all folder IDs including descendants of the given root folder.
    /// </summary>
    public HashSet<int> CollectFolderIds(int rootFolderId, IEnumerable<Folder> allFolders)
    {
        var folderIds = new HashSet<int>();
        var folderList = allFolders.ToList();

        void Collect(int folderId)
        {
            folderIds.Add(folderId);
            foreach (var sub in folderList.Where(f => f.ParentId == folderId))
            {
                Collect(sub.Id);
            }
        }

        Collect(rootFolderId);
        return folderIds;
    }

    /// <summary>
    /// Builds a recursive tree structure for a shared folder, including loadout summaries.
    /// </summary>
    public SharedFolderNode BuildSharedFolderTree(
        Folder folder,
        List<Folder> allFolders,
        List<Loadout> allLoadouts,
        HashSet<int> unlockedChapters,
        IEnumerable<IncrelutionAction> allActions)
    {
        var subFolders = allFolders
            .Where(f => f.ParentId == folder.Id)
            .OrderBy(f => f.SortOrder)
            .Select(f => BuildSharedFolderTree(f, allFolders, allLoadouts, unlockedChapters, allActions))
            .ToList();

        var loadouts = allLoadouts
            .Where(l => l.FolderId == folder.Id)
            .OrderBy(l => l.SortOrder)
            .Select(l => new SharedLoadoutSummary(l.Id, l.Name, l.UpdatedAt))
            .ToList();

        return new SharedFolderNode(folder.Id, folder.Name, subFolders, loadouts);
    }
}
