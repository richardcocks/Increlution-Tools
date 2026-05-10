using System.Security.Claims;
using IncrelutionAutomationEditor.Api.Configuration;
using IncrelutionAutomationEditor.Api.Data;
using IncrelutionAutomationEditor.Api.DTOs;
using IncrelutionAutomationEditor.Api.Models;
using IncrelutionAutomationEditor.Api.Services;
using Microsoft.EntityFrameworkCore;
using static IncrelutionAutomationEditor.Api.Endpoints.EndpointHelpers;

namespace IncrelutionAutomationEditor.Api.Endpoints;

public static class ShareEndpoints
{
    public static WebApplication MapShareEndpoints(this WebApplication app)
    {
        // === Loadout Sharing Endpoints ===

        // POST /api/loadouts/{id}/share - Create share link
        app.MapPost("/api/loadouts/{id}/share", async (
            int id,
            CreateShareRequest request,
            ClaimsPrincipal user,
            AppDbContext db,
            IdentityAppDbContext identityDb,
            ShareService shareService,
            SettingsService settingsService,
            AppLimits limits) =>
        {
            var userId = GetUserId(user);
            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
            if (loadout == null)
                return Results.NotFound("Loadout not found");

            // Check share count limit per loadout
            var shareCount = await db.LoadoutShares.CountAsync(s => s.LoadoutId == id);
            if (shareCount >= limits.MaxSharesPerLoadout)
                return Results.BadRequest($"Maximum shares per loadout ({limits.MaxSharesPerLoadout}) reached");

            // Validate expiration hours
            if (request.ExpiresInHours.HasValue &&
                (request.ExpiresInHours.Value < 1 || request.ExpiresInHours.Value > limits.MaxShareExpirationHours))
                return Results.BadRequest($"Expiration must be between 1 and {limits.MaxShareExpirationHours} hours");

            // Get user's unlocked chapters
            var unlockedChapters = await settingsService.GetUnlockedChaptersAsync(userId, identityDb);

            // Generate unique token (retry on collision)
            string token;
            do
            {
                token = shareService.GenerateShareToken();
            } while (await db.LoadoutShares.AnyAsync(s => s.ShareToken == token));

            var share = new LoadoutShare
            {
                LoadoutId = id,
                OwnerUserId = userId,
                ShareToken = token,
                CreatedAt = DateTime.UtcNow,
                ExpiresAt = request.ExpiresInHours.HasValue
                    ? DateTime.UtcNow.AddHours(request.ExpiresInHours.Value)
                    : null,
                ShowAttribution = request.ShowAttribution
            };
            share.SetUnlockedChapters(unlockedChapters);

            db.LoadoutShares.Add(share);
            await db.SaveChangesAsync();

            return Results.Ok(new LoadoutShareResponse(
                share.Id,
                share.ShareToken,
                share.CreatedAt,
                share.ExpiresAt,
                share.ShowAttribution
            ));
        })
        .RequireAuthorization()
        .WithName("CreateShare");

        // GET /api/loadouts/{id}/shares - List active shares for loadout
        app.MapGet("/api/loadouts/{id}/shares", async (int id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = GetUserId(user);
            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == id && l.UserId == userId);
            if (loadout == null)
                return Results.NotFound("Loadout not found");

            var shares = await db.LoadoutShares
                .Where(s => s.LoadoutId == id && s.OwnerUserId == userId)
                .Select(s => new LoadoutShareResponse(
                    s.Id,
                    s.ShareToken,
                    s.CreatedAt,
                    s.ExpiresAt,
                    s.ShowAttribution
                ))
                .ToListAsync();

            return Results.Ok(shares);
        })
        .RequireAuthorization()
        .WithName("GetLoadoutShares");

        // GET /api/shares - List all shares for current user
        app.MapGet("/api/shares", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = GetUserId(user);

            var shares = await db.LoadoutShares
                .Where(s => s.OwnerUserId == userId)
                .Include(s => s.Loadout)
                .Select(s => new UserShareResponse(
                    s.Id,
                    s.ShareToken,
                    s.LoadoutId,
                    s.Loadout.Name,
                    s.CreatedAt,
                    s.ExpiresAt,
                    s.ShowAttribution
                ))
                .ToListAsync();

            return Results.Ok(shares);
        })
        .RequireAuthorization()
        .WithName("GetAllUserShares");

        // DELETE /api/shares/{shareId} - Revoke share link
        app.MapDelete("/api/shares/{shareId}", async (int shareId, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = GetUserId(user);
            var share = await db.LoadoutShares.FirstOrDefaultAsync(s => s.Id == shareId && s.OwnerUserId == userId);
            if (share == null)
                return Results.NotFound("Share not found");

            db.LoadoutShares.Remove(share);
            await db.SaveChangesAsync();

            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("RevokeShare");

        // GET /api/share/{token} - View shared loadout (public, cached)
        app.MapGet("/api/share/{token}", async (
            string token,
            AppDbContext db,
            IdentityAppDbContext identityDb,
            ShareService shareService,
            GameDataService gameData) =>
        {
            var share = await db.LoadoutShares
                .Include(s => s.Loadout)
                .FirstOrDefaultAsync(s => s.ShareToken == token);

            if (share == null)
                return Results.NotFound(new SharedLoadoutErrorResponse("Share not found"));

            // Check expiration
            if (shareService.IsShareExpired(share.ExpiresAt))
                return Results.BadRequest(new SharedLoadoutErrorResponse("This share link has expired"));

            // Get owner name if attribution is enabled
            string? ownerName = null;
            if (share.ShowAttribution)
            {
                var owner = await identityDb.Users.FindAsync(share.OwnerUserId);
                ownerName = owner?.DiscordUsername;
            }

            // Filter loadout data by sharer's unlocked chapters
            var unlockedChapters = new HashSet<int>(share.GetUnlockedChapters());
            var allActions = gameData.GetAllActions();
            var loadoutData = share.Loadout.GetData();
            var filteredData = shareService.FilterLoadoutByChapters(loadoutData, allActions, unlockedChapters);

            return Results.Ok(new SharedLoadoutResponse(
                share.Loadout.Name,
                filteredData,
                share.Loadout.UpdatedAt,
                ownerName
            ));
        })
        .RequireRateLimiting("public-or-api")
        .CacheOutput("SharedLoadout")
        .WithName("GetSharedLoadout");

        // === Folder Sharing Endpoints ===

        // POST /api/folders/{id}/share - Create folder share link
        app.MapPost("/api/folders/{id}/share", async (
            int id,
            CreateFolderShareRequest request,
            ClaimsPrincipal user,
            AppDbContext db,
            IdentityAppDbContext identityDb,
            ShareService shareService,
            SettingsService settingsService,
            AppLimits limits) =>
        {
            var userId = GetUserId(user);
            var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
            if (folder == null)
                return Results.NotFound("Folder not found");

            // Cannot share root folder
            if (folder.ParentId == null)
                return Results.BadRequest("Cannot share root folder");

            // Check share count limit per folder
            var shareCount = await db.FolderShares.CountAsync(s => s.FolderId == id);
            if (shareCount >= limits.MaxSharesPerLoadout)
                return Results.BadRequest($"Maximum shares per folder ({limits.MaxSharesPerLoadout}) reached");

            // Validate expiration hours
            if (request.ExpiresInHours.HasValue &&
                (request.ExpiresInHours.Value < 1 || request.ExpiresInHours.Value > limits.MaxShareExpirationHours))
                return Results.BadRequest($"Expiration must be between 1 and {limits.MaxShareExpirationHours} hours");

            // Get user's unlocked chapters
            var unlockedChapters = await settingsService.GetUnlockedChaptersAsync(userId, identityDb);

            string token;
            if (!string.IsNullOrWhiteSpace(request.CustomToken))
            {
                // Validate and use custom token
                token = request.CustomToken.Trim().ToLowerInvariant();
                var validationError = shareService.ValidateCustomToken(token);
                if (validationError != null)
                    return Results.BadRequest(validationError);

                // Check uniqueness across both tables
                if (await db.FolderShares.AnyAsync(s => s.ShareToken == token) ||
                    await db.LoadoutShares.AnyAsync(s => s.ShareToken == token))
                    return Results.Conflict("This token is already in use");
            }
            else
            {
                // Generate unique token (retry on collision)
                do
                {
                    token = shareService.GenerateShareToken();
                } while (await db.FolderShares.AnyAsync(s => s.ShareToken == token) ||
                         await db.LoadoutShares.AnyAsync(s => s.ShareToken == token));
            }

            var share = new FolderShare
            {
                FolderId = id,
                OwnerUserId = userId,
                ShareToken = token,
                CreatedAt = DateTime.UtcNow,
                ExpiresAt = request.ExpiresInHours.HasValue
                    ? DateTime.UtcNow.AddHours(request.ExpiresInHours.Value)
                    : null,
                ShowAttribution = request.ShowAttribution
            };
            share.SetUnlockedChapters(unlockedChapters);

            db.FolderShares.Add(share);
            await db.SaveChangesAsync();

            return Results.Ok(new FolderShareResponse(
                share.Id,
                share.ShareToken,
                share.CreatedAt,
                share.ExpiresAt,
                share.ShowAttribution
            ));
        })
        .RequireAuthorization()
        .WithName("CreateFolderShare");

        // GET /api/folders/{id}/shares - List active shares for folder
        app.MapGet("/api/folders/{id}/shares", async (int id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = GetUserId(user);
            var folder = await db.Folders.FirstOrDefaultAsync(f => f.Id == id && f.UserId == userId);
            if (folder == null)
                return Results.NotFound("Folder not found");

            var shares = await db.FolderShares
                .Where(s => s.FolderId == id && s.OwnerUserId == userId)
                .Select(s => new FolderShareResponse(
                    s.Id,
                    s.ShareToken,
                    s.CreatedAt,
                    s.ExpiresAt,
                    s.ShowAttribution
                ))
                .ToListAsync();

            return Results.Ok(shares);
        })
        .RequireAuthorization()
        .WithName("GetFolderShares");

        // GET /api/folder-shares - List all folder shares for current user
        app.MapGet("/api/folder-shares", async (ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = GetUserId(user);

            var shares = await db.FolderShares
                .Where(s => s.OwnerUserId == userId)
                .Include(s => s.Folder)
                .Select(s => new UserFolderShareResponse(
                    s.Id,
                    s.ShareToken,
                    s.FolderId,
                    s.Folder.Name,
                    s.CreatedAt,
                    s.ExpiresAt,
                    s.ShowAttribution
                ))
                .ToListAsync();

            return Results.Ok(shares);
        })
        .RequireAuthorization()
        .WithName("GetAllUserFolderShares");

        // DELETE /api/folder-shares/{shareId} - Revoke folder share link
        app.MapDelete("/api/folder-shares/{shareId}", async (int shareId, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = GetUserId(user);
            var share = await db.FolderShares.FirstOrDefaultAsync(s => s.Id == shareId && s.OwnerUserId == userId);
            if (share == null)
                return Results.NotFound("Share not found");

            db.FolderShares.Remove(share);
            await db.SaveChangesAsync();

            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("RevokeFolderShare");

        // PUT /api/folder-shares/{shareId}/token - Update folder share token
        app.MapPut("/api/folder-shares/{shareId}/token", async (
            int shareId,
            UpdateFolderShareTokenRequest request,
            ClaimsPrincipal user,
            AppDbContext db,
            ShareService shareService) =>
        {
            var userId = GetUserId(user);
            var share = await db.FolderShares.FirstOrDefaultAsync(s => s.Id == shareId && s.OwnerUserId == userId);
            if (share == null)
                return Results.NotFound("Share not found");

            var token = request.Token.Trim().ToLowerInvariant();
            var validationError = shareService.ValidateCustomToken(token);
            if (validationError != null)
                return Results.BadRequest(validationError);

            // Check uniqueness across both tables, excluding the current share
            if (await db.FolderShares.AnyAsync(s => s.ShareToken == token && s.Id != shareId) ||
                await db.LoadoutShares.AnyAsync(s => s.ShareToken == token))
                return Results.Conflict("This token is already in use");

            share.ShareToken = token;
            await db.SaveChangesAsync();

            return Results.Ok(new FolderShareResponse(
                share.Id,
                share.ShareToken,
                share.CreatedAt,
                share.ExpiresAt,
                share.ShowAttribution
            ));
        })
        .RequireAuthorization()
        .WithName("UpdateFolderShareToken");

        // POST /api/folder-shares/{shareId}/regenerate-token - Regenerate random token
        app.MapPost("/api/folder-shares/{shareId}/regenerate-token", async (
            int shareId,
            ClaimsPrincipal user,
            AppDbContext db,
            ShareService shareService) =>
        {
            var userId = GetUserId(user);
            var share = await db.FolderShares.FirstOrDefaultAsync(s => s.Id == shareId && s.OwnerUserId == userId);
            if (share == null)
                return Results.NotFound("Share not found");

            string token;
            do
            {
                token = shareService.GenerateShareToken();
            } while (await db.FolderShares.AnyAsync(s => s.ShareToken == token) ||
                     await db.LoadoutShares.AnyAsync(s => s.ShareToken == token));

            share.ShareToken = token;
            await db.SaveChangesAsync();

            return Results.Ok(new FolderShareResponse(
                share.Id,
                share.ShareToken,
                share.CreatedAt,
                share.ExpiresAt,
                share.ShowAttribution
            ));
        })
        .RequireAuthorization()
        .WithName("RegenerateFolderShareToken");

        // GET /api/share/folder/{token} - View shared folder (public, cached)
        app.MapGet("/api/share/folder/{token}", async (
            string token,
            AppDbContext db,
            IdentityAppDbContext identityDb,
            ShareService shareService,
            GameDataService gameData) =>
        {
            var share = await db.FolderShares
                .Include(s => s.Folder)
                .FirstOrDefaultAsync(s => s.ShareToken == token);

            if (share == null)
                return Results.NotFound(new SharedFolderErrorResponse("Share not found"));

            // Check expiration
            if (shareService.IsShareExpired(share.ExpiresAt))
                return Results.BadRequest(new SharedFolderErrorResponse("This share link has expired"));

            // Get owner name if attribution is enabled
            string? ownerName = null;
            if (share.ShowAttribution)
            {
                var owner = await identityDb.Users.FindAsync(share.OwnerUserId);
                ownerName = owner?.DiscordUsername;
            }

            // Load all folders and loadouts recursively under this folder
            var allFolders = await db.Folders.Where(f => f.UserId == share.OwnerUserId).ToListAsync();
            var allLoadouts = await db.Loadouts.Where(l => l.UserId == share.OwnerUserId).ToListAsync();

            // Collect all folder IDs including the shared folder and its descendants
            var folderIds = shareService.CollectFolderIds(share.FolderId, allFolders);

            // Filter to only folders in the shared tree
            var foldersInTree = allFolders.Where(f => folderIds.Contains(f.Id)).ToList();
            var loadoutsInTree = allLoadouts.Where(l => folderIds.Contains(l.FolderId)).ToList();

            // Build the tree
            var unlockedChapters = new HashSet<int>(share.GetUnlockedChapters());
            var allActions = gameData.GetAllActions();
            var folderTree = shareService.BuildSharedFolderTree(share.Folder, foldersInTree, loadoutsInTree, unlockedChapters, allActions);

            // Find the most recent update time among all loadouts
            var latestUpdate = loadoutsInTree.Any()
                ? loadoutsInTree.Max(l => l.UpdatedAt)
                : share.CreatedAt;

            return Results.Ok(new SharedFolderResponse(
                share.Folder.Name,
                folderTree,
                latestUpdate,
                ownerName
            ));
        })
        .RequireRateLimiting("public-or-api")
        .CacheOutput("SharedLoadout")
        .WithName("GetSharedFolder");

        // GET /api/share/folder/{token}/loadout/{loadoutId} - Get specific loadout data from shared folder
        app.MapGet("/api/share/folder/{token}/loadout/{loadoutId}", async (
            string token,
            int loadoutId,
            AppDbContext db,
            ShareService shareService,
            GameDataService gameData) =>
        {
            var share = await db.FolderShares
                .Include(s => s.Folder)
                .FirstOrDefaultAsync(s => s.ShareToken == token);

            if (share == null)
                return Results.NotFound(new SharedFolderErrorResponse("Share not found"));

            // Check expiration
            if (shareService.IsShareExpired(share.ExpiresAt))
                return Results.BadRequest(new SharedFolderErrorResponse("This share link has expired"));

            // Verify loadout is in the shared folder tree
            var allFolders = await db.Folders.Where(f => f.UserId == share.OwnerUserId).ToListAsync();
            var folderIds = shareService.CollectFolderIds(share.FolderId, allFolders);

            var loadout = await db.Loadouts.FirstOrDefaultAsync(l => l.Id == loadoutId && folderIds.Contains(l.FolderId));
            if (loadout == null)
                return Results.NotFound(new SharedFolderErrorResponse("Loadout not found in shared folder"));

            // Filter loadout data by sharer's unlocked chapters
            var unlockedChapters = new HashSet<int>(share.GetUnlockedChapters());
            var allActions = gameData.GetAllActions();
            var loadoutData = loadout.GetData();
            var filteredData = shareService.FilterLoadoutByChapters(loadoutData, allActions, unlockedChapters);

            return Results.Ok(new SharedFolderLoadoutResponse(
                loadout.Name,
                filteredData,
                loadout.UpdatedAt
            ));
        })
        .RequireRateLimiting("public-or-api")
        .CacheOutput("SharedLoadout")
        .WithName("GetSharedFolderLoadout");

        return app;
    }
}
