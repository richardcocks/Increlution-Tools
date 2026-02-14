using System.Security.Claims;
using IncrelutionAutomationEditor.Api.Configuration;
using IncrelutionAutomationEditor.Api.Data;
using IncrelutionAutomationEditor.Api.DTOs;
using IncrelutionAutomationEditor.Api.Models;
using IncrelutionAutomationEditor.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace IncrelutionAutomationEditor.Api.Endpoints;

public static class FolderEndpoints
{
    public static WebApplication MapFolderEndpoints(this WebApplication app)
    {
        // GET /api/folders/tree - Get folder tree with all folders and loadouts
        app.MapGet("/api/folders/tree", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = EndpointHelpers.GetUserId(user);

            var folders = await db.Folders
                .Where(f => f.UserId == userId)
                .Include(f => f.SubFolders)
                .Include(f => f.Loadouts)
                .ToListAsync();

            var loadouts = await db.Loadouts
                .Where(l => l.UserId == userId)
                .ToListAsync();

            // Find root folder (the one with ParentId == null for this user)
            var rootFolder = folders.FirstOrDefault(f => f.ParentId == null);
            if (rootFolder == null)
            {
                return Results.NotFound("Root folder not found");
            }

            FolderTreeNode BuildTree(int folderId)
            {
                var folder = folders.First(f => f.Id == folderId);

                return new FolderTreeNode(
                    folder.Id,
                    folder.Name,
                    folder.ParentId,
                    folder.IsReadOnly,
                    folders.Where(f => f.ParentId == folder.Id)
                        .OrderBy(f => f.SortOrder)
                        .Select(f => BuildTree(f.Id))
                        .ToList(),
                    loadouts.Where(l => l.FolderId == folder.Id)
                        .OrderBy(l => l.SortOrder)
                        .Select(l => new LoadoutSummary(l.Id, l.Name, l.UpdatedAt, l.IsProtected))
                        .ToList()
                );
            }

            return Results.Ok(BuildTree(rootFolder.Id));
        })
        .RequireAuthorization()
        .WithName("GetFolderTree");

        // GET /api/loadout/{id} - Get specific loadout
        app.MapGet("/api/loadout/{id}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
            if (loadout == null)
                return Results.NotFound("Loadout not found");

            return Results.Ok(new
            {
                loadout.Id,
                loadout.Name,
                loadout.FolderId,
                loadout.CreatedAt,
                loadout.UpdatedAt,
                loadout.IsProtected,
                Data = loadout.GetData()
            });
        })
        .RequireAuthorization()
        .WithName("GetLoadout");

        // POST /api/folders - Create new folder
        app.MapPost("/api/folders", async (CreateFolderRequest request, ClaimsPrincipal user, AppDbContext db, FolderService folderService, AppLimits limits) =>
        {
            var userId = EndpointHelpers.GetUserId(user);

            // Check folder count limit
            var folderCount = await db.Folders.CountAsync(f => f.UserId == userId);
            if (folderCount >= limits.MaxFoldersPerUser)
                return Results.BadRequest($"Maximum folder limit ({limits.MaxFoldersPerUser}) reached");

            // Verify parent folder belongs to user
            var parentFolder = await db.Folders.FirstOrDefaultAsync(f => f.Id == request.ParentId && f.UserId == userId);
            if (parentFolder == null)
                return Results.NotFound("Parent folder not found");

            // Check folder read-only
            var allFolders = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            if (folderService.IsFolderOrAncestorReadOnly(allFolders, request.ParentId))
                return Results.BadRequest("Folder is read-only");

            // Check folder depth limit
            int GetDepth(int? parentId)
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
            var currentDepth = GetDepth(request.ParentId);
            if (currentDepth >= limits.MaxFolderDepth)
                return Results.BadRequest($"Maximum folder depth ({limits.MaxFolderDepth}) reached");

            // Calculate next sort order for subfolders in the parent
            var maxFolderSortOrder = await db.Folders
                .Where(f => f.ParentId == request.ParentId && f.UserId == userId)
                .MaxAsync(f => (int?)f.SortOrder) ?? -1;

            var folder = new Folder
            {
                Name = request.Name.Trim(),
                ParentId = request.ParentId,
                UserId = userId,
                CreatedAt = DateTime.UtcNow,
                SortOrder = maxFolderSortOrder + 1
            };
            db.Folders.Add(folder);
            await db.SaveChangesAsync();

            return Results.Ok(folder);
        })
        .RequireAuthorization()
        .WithName("CreateFolder");

        // PUT /api/folders/{id} - Rename folder
        app.MapPut("/api/folders/{id}", async (int id, RenameFolderRequest request, ClaimsPrincipal user, AppDbContext db, FolderService folderService) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
            if (folder == null)
                return Results.NotFound("Folder not found");

            // Prevent renaming root folder
            if (folder.ParentId == null)
                return Results.BadRequest("Cannot rename root folder");

            // Check folder read-only
            var allFoldersForRename = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            if (folderService.IsFolderOrAncestorReadOnly(allFoldersForRename, id))
                return Results.BadRequest("Folder is read-only");

            folder.Name = request.Name.Trim();
            await db.SaveChangesAsync();

            return Results.Ok(folder);
        })
        .RequireAuthorization()
        .WithName("RenameFolder");

        // DELETE /api/folders/{id} - Delete folder
        app.MapDelete("/api/folders/{id}", async (int id, bool force, ClaimsPrincipal user, AppDbContext db, FolderService folderService, ShareService shareService) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var folder = await db.Folders
                .Include(f => f.SubFolders)
                .Include(f => f.Loadouts)
                .FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);

            if (folder == null)
                return Results.NotFound("Folder not found");

            // Prevent deleting root folder
            if (folder.ParentId == null)
                return Results.BadRequest("Cannot delete root folder");

            // Check folder read-only (check parent, since the folder itself being read-only shouldn't prevent deletion by parent)
            var allFoldersForDeleteFolder = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            if (folderService.IsFolderOrAncestorReadOnly(allFoldersForDeleteFolder, id))
                return Results.BadRequest("Folder is read-only");

            var hasContents = folder.SubFolders.Any() || folder.Loadouts.Any();

            // If folder has contents and force is not set, reject
            if (hasContents && !force)
                return Results.BadRequest("Cannot delete folder with contents");

            var foldersDeleted = 0;
            var loadoutsDeleted = 0;
            var protectedLoadoutsMoved = 0;

            if (force && hasContents)
            {
                // Recursive delete - load all folders and loadouts for this user
                var allFolders = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
                var allLoadouts = await db.Loadouts.Where(l => l.UserId == userId).ToListAsync();
                var allShares = await db.LoadoutShares.Where(s => s.OwnerUserId == userId).ToListAsync();

                // Find all folder IDs to delete (including nested)
                var folderIdsToDelete = shareService.CollectFolderIds(id, allFolders);

                // Find loadouts in these folders
                var loadoutsInFolders = allLoadouts.Where(l => folderIdsToDelete.Contains(l.FolderId)).ToList();
                var protectedLoadouts = loadoutsInFolders.Where(l => l.IsProtected).ToList();
                var unprotectedLoadouts = loadoutsInFolders.Where(l => !l.IsProtected).ToList();

                // Re-parent protected loadouts to the parent folder (append to end)
                var maxParentLoadoutSortOrder = allLoadouts
                    .Where(l => l.FolderId == folder.ParentId!.Value)
                    .Select(l => (int?)l.SortOrder)
                    .Max() ?? -1;
                foreach (var protectedLoadout in protectedLoadouts)
                {
                    maxParentLoadoutSortOrder++;
                    protectedLoadout.FolderId = folder.ParentId!.Value;
                    protectedLoadout.SortOrder = maxParentLoadoutSortOrder;
                    protectedLoadout.UpdatedAt = DateTime.UtcNow;
                }
                protectedLoadoutsMoved = protectedLoadouts.Count;

                // Delete shares for unprotected loadouts only
                var unprotectedLoadoutIds = unprotectedLoadouts.Select(l => l.Id).ToHashSet();
                var sharesToDelete = allShares.Where(s => unprotectedLoadoutIds.Contains(s.LoadoutId)).ToList();
                db.LoadoutShares.RemoveRange(sharesToDelete);

                // Delete unprotected loadouts
                db.Loadouts.RemoveRange(unprotectedLoadouts);
                loadoutsDeleted = unprotectedLoadouts.Count;

                // Delete all folders
                var foldersToDelete = allFolders.Where(f => folderIdsToDelete.Contains(f.Id)).ToList();
                db.Folders.RemoveRange(foldersToDelete);
                foldersDeleted = foldersToDelete.Count;
            }
            else
            {
                db.Folders.Remove(folder);
                foldersDeleted = 1;
            }

            await db.SaveChangesAsync();

            return Results.Ok(new DeleteFolderResponse(foldersDeleted, loadoutsDeleted, protectedLoadoutsMoved));
        })
        .RequireAuthorization()
        .WithName("DeleteFolder");

        // PUT /api/folders/{id}/parent - Move folder to a different parent
        app.MapPut("/api/folders/{id}/parent", async (int id, MoveFolderRequest request, ClaimsPrincipal user, AppDbContext db, FolderService folderService, AppLimits limits) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
            if (folder == null)
                return Results.NotFound("Folder not found");

            // Cannot move root folder
            if (folder.ParentId == null)
                return Results.BadRequest("Cannot move root folder");

            // Check source parent folder read-only
            var allFoldersPreCheck = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            if (folder.ParentId.HasValue && folderService.IsFolderOrAncestorReadOnly(allFoldersPreCheck, folder.ParentId.Value))
                return Results.BadRequest("Folder is read-only");

            var targetFolder = await db.Folders.FirstOrDefaultAsync(f => f.Id == request.ParentId && f.UserId == userId);
            if (targetFolder == null)
                return Results.NotFound("Target folder not found");

            // Cannot move to same parent
            if (folder.ParentId == request.ParentId)
                return Results.Ok();

            // Cannot move folder into itself
            if (id == request.ParentId)
                return Results.BadRequest("Cannot move folder into itself");

            // Check if target is a descendant of the folder being moved (would create cycle)
            var allFolders = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            bool IsDescendant(int? parentId, int ancestorId)
            {
                while (parentId != null)
                {
                    if (parentId == ancestorId) return true;
                    var parent = allFolders.FirstOrDefault(f => f.Id == parentId);
                    parentId = parent?.ParentId;
                }
                return false;
            }

            if (IsDescendant(request.ParentId, id))
                return Results.BadRequest("Cannot move folder into its own descendant");

            // Check folder depth limit after move
            int GetDepth(int? parentId)
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

            int GetMaxSubfolderDepth(int folderId)
            {
                int maxDepth = 0;
                var subfolders = allFolders.Where(f => f.ParentId == folderId).ToList();
                foreach (var sub in subfolders)
                {
                    var subDepth = 1 + GetMaxSubfolderDepth(sub.Id);
                    if (subDepth > maxDepth) maxDepth = subDepth;
                }
                return maxDepth;
            }

            var targetDepth = GetDepth(request.ParentId);
            var folderSubDepth = GetMaxSubfolderDepth(id);
            var newTotalDepth = targetDepth + 1 + folderSubDepth;

            if (newTotalDepth > limits.MaxFolderDepth)
                return Results.BadRequest($"Move would exceed maximum folder depth ({limits.MaxFolderDepth})");

            // Append to end of target folder
            var maxSortOrder = allFolders
                .Where(f => f.ParentId == request.ParentId)
                .Select(f => (int?)f.SortOrder)
                .Max() ?? -1;

            folder.ParentId = request.ParentId;
            folder.SortOrder = maxSortOrder + 1;
            await db.SaveChangesAsync();
            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("MoveFolder");

        // PUT /api/folders/{id}/reorder - Reorder items within a folder
        app.MapPut("/api/folders/{id}/reorder", async (int id, ReorderRequest request, ClaimsPrincipal user, AppDbContext db, FolderService folderService) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
            if (folder == null)
                return Results.NotFound("Folder not found");

            // Check folder read-only
            var allFoldersForReorder = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            if (folderService.IsFolderOrAncestorReadOnly(allFoldersForReorder, id))
                return Results.BadRequest("Folder is read-only");

            if (request.ItemType != "folder" && request.ItemType != "loadout")
                return Results.BadRequest("Item type must be 'folder' or 'loadout'");

            if (request.OrderedIds == null || request.OrderedIds.Count == 0)
                return Results.BadRequest("Ordered IDs are required");

            if (request.ItemType == "folder")
            {
                var subFolders = await db.Folders
                    .Where(f => f.ParentId == id && f.UserId == userId)
                    .ToListAsync();

                var subFolderIds = subFolders.Select(f => f.Id).ToHashSet();
                var requestedIds = request.OrderedIds.ToHashSet();

                if (!requestedIds.SetEquals(subFolderIds))
                    return Results.BadRequest("Ordered IDs must match all subfolders in this folder");

                for (var i = 0; i < request.OrderedIds.Count; i++)
                {
                    var sub = subFolders.First(f => f.Id == request.OrderedIds[i]);
                    sub.SortOrder = i;
                }
            }
            else
            {
                var loadouts = await db.Loadouts
                    .Where(l => l.FolderId == id && l.UserId == userId)
                    .ToListAsync();

                var loadoutIds = loadouts.Select(l => l.Id).ToHashSet();
                var requestedIds = request.OrderedIds.ToHashSet();

                if (!requestedIds.SetEquals(loadoutIds))
                    return Results.BadRequest("Ordered IDs must match all loadouts in this folder");

                for (var i = 0; i < request.OrderedIds.Count; i++)
                {
                    var loadout = loadouts.First(l => l.Id == request.OrderedIds[i]);
                    loadout.SortOrder = i;
                }
            }

            await db.SaveChangesAsync();
            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("ReorderFolderItems");

        // PUT /api/folders/{id}/readonly - Toggle folder read-only flag
        app.MapPut("/api/folders/{id}/readonly", async (int id, SetFolderReadOnlyRequest request, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
            if (folder == null)
                return Results.NotFound("Folder not found");

            folder.IsReadOnly = request.IsReadOnly;
            await db.SaveChangesAsync();

            return Results.Ok(new { folder.IsReadOnly });
        })
        .RequireAuthorization()
        .WithName("SetFolderReadOnly");

        // POST /api/folders/{id}/duplicate - Duplicate a folder and all its contents
        app.MapPost("/api/folders/{id}/duplicate", async (int id, ClaimsPrincipal user, AppDbContext db, FolderService folderService, AppLimits limits) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
            if (folder == null)
                return Results.NotFound("Folder not found");

            // Cannot duplicate root folder
            if (folder.ParentId == null)
                return Results.BadRequest("Cannot duplicate root folder");

            // Load all user's folders and loadouts to check limits and calculate depth
            var allFolders = await folderService.GetUserFoldersAsync(db, userId);
            var allLoadouts = await db.Loadouts.Where(l => l.UserId == userId).ToListAsync();

            var foldersToCreate = folderService.CountFoldersRecursive(allFolders, id);
            var loadoutsToCreate = folderService.CountLoadoutsRecursive(allFolders, allLoadouts, id);

            // Check folder limit
            if (allFolders.Count + foldersToCreate > limits.MaxFoldersPerUser)
                return Results.BadRequest($"Duplicating would exceed maximum folder limit ({limits.MaxFoldersPerUser})");

            // Check loadout limit
            if (allLoadouts.Count + loadoutsToCreate > limits.MaxLoadoutsPerUser)
                return Results.BadRequest($"Duplicating would exceed maximum loadout limit ({limits.MaxLoadoutsPerUser})");

            // Check depth limit
            var parentDepth = folderService.GetDepth(allFolders, folder.ParentId);
            var subfolderDepth = folderService.GetMaxSubfolderDepth(allFolders, id);
            // New folder will be at parentDepth + 1, plus its subfolders
            var newTotalDepth = parentDepth + 1 + subfolderDepth;
            if (newTotalDepth > limits.MaxFolderDepth)
                return Results.BadRequest($"Duplicating would exceed maximum folder depth ({limits.MaxFolderDepth})");

            // Shift subsequent sibling folders to make room after the original
            var siblingsAfter = allFolders
                .Where(f => f.ParentId == folder.ParentId && f.SortOrder > folder.SortOrder)
                .ToList();
            foreach (var s in siblingsAfter)
                s.SortOrder++;

            // Recursively duplicate the folder structure
            var duplicateResult = await folderService.DuplicateFolderRecursiveAsync(
                db, allFolders, allLoadouts, id, folder.ParentId, userId, true, folder.SortOrder + 1);
            var newRootFolder = duplicateResult.RootFolder;

            return Results.Ok(new DuplicateFolderResponse(
                newRootFolder.Id,
                newRootFolder.Name,
                newRootFolder.ParentId,
                duplicateResult.FoldersCopied,
                duplicateResult.LoadoutsCopied
            ));
        })
        .RequireAuthorization()
        .WithName("DuplicateFolder");

        return app;
    }
}
