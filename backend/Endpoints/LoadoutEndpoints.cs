using System.Security.Claims;
using IncrelutionAutomationEditor.Api.Configuration;
using IncrelutionAutomationEditor.Api.Data;
using IncrelutionAutomationEditor.Api.DTOs;
using IncrelutionAutomationEditor.Api.Models;
using IncrelutionAutomationEditor.Api.Services;
using Microsoft.AspNetCore.OutputCaching;
using Microsoft.EntityFrameworkCore;

namespace IncrelutionAutomationEditor.Api.Endpoints;

public static class LoadoutEndpoints
{
    public static WebApplication MapLoadoutEndpoints(this WebApplication app)
    {
        // POST /api/loadouts - Create new loadout
        app.MapPost("/api/loadouts", async (
            CreateLoadoutRequest request,
            ClaimsPrincipal user,
            AppDbContext db,
            IdentityAppDbContext identityDb,
            GameDataService gameData,
            FolderService folderService,
            SettingsService settingsService,
            LoadoutService loadoutService,
            AppLimits limits) =>
        {
            var userId = EndpointHelpers.GetUserId(user);

            // Check loadout count limit
            var loadoutCount = await db.Loadouts.CountAsync(l => l.UserId == userId);
            if (loadoutCount >= limits.MaxLoadoutsPerUser)
                return Results.BadRequest($"Maximum loadout limit ({limits.MaxLoadoutsPerUser}) reached");

            // Verify folder belongs to user
            var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == request.FolderId && f.UserId == userId);
            if (folder == null)
                return Results.NotFound("Folder not found");

            // Check folder read-only
            var allFoldersForCreate = await folderService.GetUserFoldersAsync(db, userId);
            if (folderService.IsFolderOrAncestorReadOnly(allFoldersForCreate, request.FolderId))
                return Results.BadRequest("Folder is read-only");

            // Get user's default skill priorities and unlocked chapters
            var data = new Dictionary<string, Dictionary<string, int>>();
            var appUser = await identityDb.Users.FindAsync(userId);
            if (appUser != null)
            {
                var settings = settingsService.GetUserSettings(appUser);
                data = loadoutService.BuildDefaultLoadoutData(settings, gameData.GetAllActions());
            }

            // Calculate next sort order for loadouts in the folder
            var maxLoadoutSortOrder = await db.Loadouts
                .Where(l => l.FolderId == request.FolderId && l.UserId == userId)
                .MaxAsync(l => (int?)l.SortOrder) ?? -1;

            var loadout = new Loadout
            {
                Name = request.Name.Trim(),
                FolderId = request.FolderId,
                UserId = userId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                Data = System.Text.Json.JsonSerializer.Serialize(data),
                SortOrder = maxLoadoutSortOrder + 1
            };
            db.Loadouts.Add(loadout);
            await db.SaveChangesAsync();

            return Results.Ok(loadout);
        })
        .RequireAuthorization()
        .WithName("CreateLoadout");

        // DELETE /api/loadouts/{id} - Delete loadout
        app.MapDelete("/api/loadouts/{id}", async (int id, ClaimsPrincipal user, AppDbContext db, FolderService folderService) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
            if (loadout == null)
                return Results.NotFound("Loadout not found");

            if (loadout.IsProtected)
                return Results.BadRequest("Cannot delete a protected loadout");

            // Check folder read-only
            var allFoldersForDelete = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            if (folderService.IsFolderOrAncestorReadOnly(allFoldersForDelete, loadout.FolderId))
                return Results.BadRequest("Folder is read-only");

            db.Loadouts.Remove(loadout);
            await db.SaveChangesAsync();

            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("DeleteLoadout");

        // PUT /api/loadout/action - Update automation level for an action
        app.MapPut("/api/loadout/action", async (
            UpdateActionRequest request,
            ClaimsPrincipal user,
            AppDbContext db,
            FolderService folderService,
            IOutputCacheStore cacheStore,
            AppLimits limits) =>
        {
            var userId = EndpointHelpers.GetUserId(user);

            // Validate action type
            if (request.ActionType < 0 || request.ActionType > 2)
                return Results.BadRequest("Action type must be 0, 1, or 2");

            // Validate automation level
            if (request.AutomationLevel.HasValue &&
                (request.AutomationLevel.Value < limits.MinAutomationLevel ||
                 request.AutomationLevel.Value > limits.MaxAutomationLevel))
                return Results.BadRequest($"Automation level must be between {limits.MinAutomationLevel} and {limits.MaxAutomationLevel}");

            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == request.LoadoutId && l.UserId == userId);

            if (loadout == null)
                return Results.NotFound("Loadout not found");

            if (loadout.IsProtected)
                return Results.BadRequest("Cannot modify a protected loadout");

            // Check folder read-only
            var allFoldersForAction = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            if (folderService.IsFolderOrAncestorReadOnly(allFoldersForAction, loadout.FolderId))
                return Results.BadRequest("Folder is read-only");

            var data = loadout.GetData();

            // Ensure the action type dictionary exists
            if (!data.ContainsKey(request.ActionType))
            {
                data[request.ActionType] = new Dictionary<int, int?>();
            }

            // Update or remove the automation level
            if (request.AutomationLevel == null)
            {
                data[request.ActionType].Remove(request.ActionId);
            }
            else
            {
                data[request.ActionType][request.ActionId] = request.AutomationLevel;
            }

            loadout.SetData(data);
            loadout.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            // Invalidate all cached shared loadouts (since we can't tag by individual loadout ID)
            await cacheStore.EvictByTagAsync("shared-loadouts", default);

            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("UpdateActionAutomationLevel");

        // PUT /api/loadouts/{id}/name - Update loadout name
        app.MapPut("/api/loadouts/{id}/name", async (
            int id,
            UpdateLoadoutNameRequest request,
            ClaimsPrincipal user,
            AppDbContext db,
            FolderService folderService,
            IOutputCacheStore cacheStore) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
            if (loadout == null)
                return Results.NotFound("Loadout not found");

            if (loadout.IsProtected)
                return Results.BadRequest("Cannot modify a protected loadout");

            // Check folder read-only
            var allFoldersForName = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            if (folderService.IsFolderOrAncestorReadOnly(allFoldersForName, loadout.FolderId))
                return Results.BadRequest("Folder is read-only");

            loadout.Name = request.Name.Trim();
            loadout.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            // Invalidate all cached shared loadouts
            await cacheStore.EvictByTagAsync("shared-loadouts", default);

            return Results.Ok(loadout);
        })
        .RequireAuthorization()
        .WithName("UpdateLoadoutName");

        // PUT /api/loadouts/{id}/protection - Toggle loadout protection
        app.MapPut("/api/loadouts/{id}/protection", async (
            int id,
            UpdateLoadoutProtectionRequest request,
            ClaimsPrincipal user,
            AppDbContext db) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
            if (loadout == null)
                return Results.NotFound("Loadout not found");

            loadout.IsProtected = request.IsProtected;
            await db.SaveChangesAsync();

            return Results.Ok(new { loadout.IsProtected });
        })
        .RequireAuthorization()
        .WithName("UpdateLoadoutProtection");

        // POST /api/loadouts/{id}/import - Import loadout data
        app.MapPost("/api/loadouts/{id}/import", async (
            int id,
            ImportLoadoutRequest request,
            ClaimsPrincipal user,
            AppDbContext db,
            FolderService folderService,
            IOutputCacheStore cacheStore,
            AppLimits limits) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
            if (loadout == null)
                return Results.NotFound("Loadout not found");

            if (loadout.IsProtected)
                return Results.BadRequest("Cannot modify a protected loadout");

            // Check folder read-only
            var allFoldersForImport = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            if (folderService.IsFolderOrAncestorReadOnly(allFoldersForImport, loadout.FolderId))
                return Results.BadRequest("Folder is read-only");

            // Validate imported data
            if (request.Data != null)
            {
                foreach (var (actionType, actions) in request.Data)
                {
                    // Validate action type
                    if (actionType < 0 || actionType > 2)
                        return Results.BadRequest("Invalid action type in import data");

                    // Validate automation levels
                    foreach (var (actionId, level) in actions)
                    {
                        if (level.HasValue &&
                            (level.Value < limits.MinAutomationLevel || level.Value > limits.MaxAutomationLevel))
                            return Results.BadRequest($"Invalid automation level in import data (must be {limits.MinAutomationLevel}-{limits.MaxAutomationLevel})");
                    }
                }
            }

            if (request.Data == null)
                return Results.BadRequest("Data is required");

            loadout.SetData(request.Data);
            loadout.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();

            // Invalidate all cached shared loadouts
            await cacheStore.EvictByTagAsync("shared-loadouts", default);

            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("ImportLoadout");

        // GET /api/loadouts/{id}/export - Export loadout data
        app.MapGet("/api/loadouts/{id}/export", async (int id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
            if (loadout == null)
                return Results.NotFound("Loadout not found");

            return Results.Ok(loadout.GetData());
        })
        .RequireAuthorization()
        .WithName("ExportLoadout");

        // PUT /api/loadouts/{id}/folder - Move loadout to a different folder
        app.MapPut("/api/loadouts/{id}/folder", async (int id, MoveLoadoutRequest request, ClaimsPrincipal user, AppDbContext db, FolderService folderService) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
            if (loadout == null)
                return Results.NotFound("Loadout not found");

            // Check source folder read-only
            var allFoldersForMove = await db.Folders.Where(f => f.UserId == userId).ToListAsync();
            if (folderService.IsFolderOrAncestorReadOnly(allFoldersForMove, loadout.FolderId))
                return Results.BadRequest("Folder is read-only");

            var targetFolder = await db.Folders.FirstOrDefaultAsync(f => f.Id == request.FolderId && f.UserId == userId);
            if (targetFolder == null)
                return Results.NotFound("Target folder not found");

            if (loadout.FolderId == request.FolderId)
                return Results.Ok();

            // Append to end of target folder
            var maxSortOrder = await db.Loadouts
                .Where(l => l.FolderId == request.FolderId && l.UserId == userId)
                .MaxAsync(l => (int?)l.SortOrder) ?? -1;

            loadout.FolderId = request.FolderId;
            loadout.SortOrder = maxSortOrder + 1;
            loadout.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("MoveLoadout");

        // POST /api/loadouts/{id}/duplicate - Duplicate a loadout
        app.MapPost("/api/loadouts/{id}/duplicate", async (int id, ClaimsPrincipal user, AppDbContext db, FolderService folderService, AppLimits limits) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
            if (loadout == null)
                return Results.NotFound("Loadout not found");

            // Check loadout count limit
            var loadoutCount = await db.Loadouts.CountAsync(l => l.UserId == userId);
            if (loadoutCount >= limits.MaxLoadoutsPerUser)
                return Results.BadRequest($"Maximum loadout limit ({limits.MaxLoadoutsPerUser}) reached");

            // Shift subsequent loadouts to make room after the original
            var siblingsAfter = await db.Loadouts
                .Where(l => l.FolderId == loadout.FolderId && l.UserId == userId && l.SortOrder > loadout.SortOrder)
                .ToListAsync();
            foreach (var s in siblingsAfter)
                s.SortOrder++;

            var newLoadout = new Loadout
            {
                Name = folderService.GenerateCopyName(loadout.Name),
                FolderId = loadout.FolderId,
                UserId = userId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                Data = loadout.Data, // Copy the JSON data as-is
                IsProtected = false,  // New duplicates are unprotected
                SortOrder = loadout.SortOrder + 1
            };
            db.Loadouts.Add(newLoadout);
            await db.SaveChangesAsync();

            return Results.Ok(new DuplicateLoadoutResponse(
                newLoadout.Id,
                newLoadout.Name,
                newLoadout.FolderId,
                newLoadout.UpdatedAt,
                newLoadout.IsProtected
            ));
        })
        .RequireAuthorization()
        .WithName("DuplicateLoadout");

        return app;
    }
}
