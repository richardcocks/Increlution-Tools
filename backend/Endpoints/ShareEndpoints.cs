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

        // POST /api/share/{token}/save - Save to "Others' Loadouts"
        app.MapPost("/api/share/{token}/save", async (
            string token,
            ClaimsPrincipal user,
            AppDbContext db,
            IdentityAppDbContext identityDb,
            ShareService shareService,
            AppLimits limits) =>
        {
            var userId = GetUserId(user);

            // Check saved share limit
            var savedCount = await db.SavedShares.CountAsync(s => s.UserId == userId);
            if (savedCount >= limits.MaxSavedSharesPerUser)
                return Results.BadRequest($"Maximum saved shares ({limits.MaxSavedSharesPerUser}) reached");

            var share = await db.LoadoutShares
                .Include(s => s.Loadout)
                .FirstOrDefaultAsync(s => s.ShareToken == token);

            if (share == null)
                return Results.NotFound("Share not found");

            // Check expiration
            if (shareService.IsShareExpired(share.ExpiresAt))
                return Results.BadRequest("This share link has expired");

            // Check if already saved
            var existing = await db.SavedShares
                .FirstOrDefaultAsync(s => s.UserId == userId && s.LoadoutShareId == share.Id);

            if (existing != null)
                return Results.BadRequest("Already saved to your collection");

            // Can't save your own loadout
            if (share.OwnerUserId == userId)
                return Results.BadRequest("Cannot save your own loadout");

            var savedShare = new SavedShare
            {
                UserId = userId,
                LoadoutShareId = share.Id,
                SavedAt = DateTime.UtcNow
            };

            db.SavedShares.Add(savedShare);
            await db.SaveChangesAsync();

            // Get owner name if attribution is enabled
            string? ownerName = null;
            if (share.ShowAttribution)
            {
                var owner = await identityDb.Users.FindAsync(share.OwnerUserId);
                ownerName = owner?.DiscordUsername;
            }

            return Results.Ok(new SavedShareResponse(
                savedShare.Id,
                share.ShareToken,
                share.Loadout.Name,
                ownerName,
                savedShare.SavedAt
            ));
        })
        .RequireAuthorization()
        .WithName("SaveShare");

        // === Saved Shares Endpoints ===

        // GET /api/saved-shares - List user's saved shares
        app.MapGet("/api/saved-shares", async (
            ClaimsPrincipal user,
            AppDbContext db,
            IdentityAppDbContext identityDb) =>
        {
            var userId = GetUserId(user);

            var savedShares = await db.SavedShares
                .Where(s => s.UserId == userId)
                .Include(s => s.LoadoutShare)
                .ThenInclude(ls => ls!.Loadout)
                .ToListAsync();

            // Batch fetch owner names to avoid N+1 queries
            var ownerUserIds = savedShares
                .Where(s => s.LoadoutShare is not null && s.LoadoutShare.ShowAttribution)
                .Select(s => s.LoadoutShare!.OwnerUserId)
                .Distinct()
                .ToList();

            var ownerNames = await identityDb.Users
                .Where(u => ownerUserIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => u.DiscordUsername);

            var results = new List<SavedShareResponse>();
            foreach (var saved in savedShares)
            {
                if (saved.LoadoutShare is null)
                    continue;

                string? ownerName = null;
                if (saved.LoadoutShare.ShowAttribution &&
                    ownerNames.TryGetValue(saved.LoadoutShare.OwnerUserId, out var name))
                {
                    ownerName = name;
                }

                results.Add(new SavedShareResponse(
                    saved.Id,
                    saved.LoadoutShare.ShareToken,
                    saved.LoadoutShare.Loadout.Name,
                    ownerName,
                    saved.SavedAt
                ));
            }

            return Results.Ok(results);
        })
        .RequireAuthorization()
        .WithName("GetSavedShares");

        // DELETE /api/saved-shares/{id} - Remove from saved
        app.MapDelete("/api/saved-shares/{id}", async (int id, ClaimsPrincipal user, AppDbContext db) =>
        {
            var userId = GetUserId(user);
            var savedShare = await db.SavedShares.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
            if (savedShare == null)
                return Results.NotFound("Saved share not found");

            db.SavedShares.Remove(savedShare);
            await db.SaveChangesAsync();

            return Results.Ok();
        })
        .RequireAuthorization()
        .WithName("RemoveSavedShare");

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

        // POST /api/share/folder/{token}/save - Save folder to "Others' Loadouts"
        app.MapPost("/api/share/folder/{token}/save", async (
            string token,
            ClaimsPrincipal user,
            AppDbContext db,
            IdentityAppDbContext identityDb,
            ShareService shareService,
            AppLimits limits) =>
        {
            var userId = GetUserId(user);

            // Check saved share limit
            var savedCount = await db.SavedShares.CountAsync(s => s.UserId == userId);
            if (savedCount >= limits.MaxSavedSharesPerUser)
                return Results.BadRequest($"Maximum saved shares ({limits.MaxSavedSharesPerUser}) reached");

            var share = await db.FolderShares
                .Include(s => s.Folder)
                .FirstOrDefaultAsync(s => s.ShareToken == token);

            if (share == null)
                return Results.NotFound("Share not found");

            // Check expiration
            if (shareService.IsShareExpired(share.ExpiresAt))
                return Results.BadRequest("This share link has expired");

            // Check if already saved
            var existing = await db.SavedShares
                .FirstOrDefaultAsync(s => s.UserId == userId && s.FolderShareId == share.Id);

            if (existing != null)
                return Results.BadRequest("Already saved to your collection");

            // Can't save your own folder
            if (share.OwnerUserId == userId)
                return Results.BadRequest("Cannot save your own folder");

            var savedShare = new SavedShare
            {
                UserId = userId,
                FolderShareId = share.Id,
                SavedAt = DateTime.UtcNow
            };

            db.SavedShares.Add(savedShare);
            await db.SaveChangesAsync();

            // Get owner name if attribution is enabled
            string? ownerName = null;
            if (share.ShowAttribution)
            {
                var owner = await identityDb.Users.FindAsync(share.OwnerUserId);
                ownerName = owner?.DiscordUsername;
            }

            // Build folder tree for response
            var allFolders = await db.Folders.Where(f => f.UserId == share.OwnerUserId).ToListAsync();
            var allLoadouts = await db.Loadouts.Where(l => l.UserId == share.OwnerUserId).ToListAsync();
            var folderIds = shareService.CollectFolderIds(share.FolderId, allFolders);
            var foldersInTree = allFolders.Where(f => folderIds.Contains(f.Id)).ToList();
            var loadoutsInTree = allLoadouts.Where(l => folderIds.Contains(l.FolderId)).ToList();
            var unlockedChapters = new HashSet<int>(share.GetUnlockedChapters());

            return Results.Ok(new SavedShareUnifiedResponse(
                savedShare.Id,
                share.ShareToken,
                "folder",
                share.Folder.Name,
                ownerName,
                savedShare.SavedAt,
                shareService.BuildSharedFolderTree(share.Folder, foldersInTree, loadoutsInTree, unlockedChapters, Array.Empty<IncrelutionAction>())
            ));
        })
        .RequireAuthorization()
        .WithName("SaveFolderShare");

        // GET /api/saved-shares/unified - List user's saved shares (both loadouts and folders)
        app.MapGet("/api/saved-shares/unified", async (
            ClaimsPrincipal user,
            AppDbContext db,
            IdentityAppDbContext identityDb,
            ShareService shareService,
            GameDataService gameData) =>
        {
            var userId = GetUserId(user);

            var savedShares = await db.SavedShares
                .Where(s => s.UserId == userId)
                .Include(s => s.LoadoutShare)
                .ThenInclude(ls => ls != null ? ls.Loadout : null)
                .Include(s => s.FolderShare)
                .ThenInclude(fs => fs != null ? fs.Folder : null)
                .ToListAsync();

            // Pre-fetch all data to avoid N+1 queries
            // 1. Collect all distinct owner user IDs that need attribution
            var ownerUserIds = savedShares
                .Where(s => (s.LoadoutShare?.ShowAttribution ?? s.FolderShare?.ShowAttribution ?? false))
                .Select(s => s.LoadoutShare?.OwnerUserId ?? s.FolderShare?.OwnerUserId)
                .Where(id => id.HasValue)
                .Select(id => id!.Value)
                .Distinct()
                .ToList();

            // 2. Batch fetch all owner usernames
            var ownerNames = await identityDb.Users
                .Where(u => ownerUserIds.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => u.DiscordUsername);

            // 3. Collect all distinct owner user IDs for folder shares (need their folders/loadouts)
            var folderShareOwnerIds = savedShares
                .Where(s => s.FolderShareId != null && s.FolderShare != null)
                .Select(s => s.FolderShare!.OwnerUserId)
                .Distinct()
                .ToList();

            // 4. Batch fetch all folders and loadouts for folder share owners
            var allFoldersByOwner = await db.Folders
                .Where(f => f.UserId.HasValue && folderShareOwnerIds.Contains(f.UserId.Value))
                .ToListAsync();
            var foldersByOwner = allFoldersByOwner
                .Where(f => f.UserId.HasValue)
                .GroupBy(f => f.UserId!.Value)
                .ToDictionary(g => g.Key, g => g.ToList());

            var allLoadoutsByOwner = await db.Loadouts
                .Where(l => l.UserId.HasValue && folderShareOwnerIds.Contains(l.UserId.Value))
                .ToListAsync();
            var loadoutsByOwner = allLoadoutsByOwner
                .Where(l => l.UserId.HasValue)
                .GroupBy(l => l.UserId!.Value)
                .ToDictionary(g => g.Key, g => g.ToList());

            var results = new List<SavedShareUnifiedResponse>();
            var allActions = gameData.GetAllActions();

            foreach (var saved in savedShares)
            {
                string? ownerName = null;
                var showAttribution = saved.LoadoutShare?.ShowAttribution ?? saved.FolderShare?.ShowAttribution ?? true;
                var ownerUserId = saved.LoadoutShare?.OwnerUserId ?? saved.FolderShare?.OwnerUserId;

                if (showAttribution && ownerUserId.HasValue && ownerNames.TryGetValue(ownerUserId.Value, out var name))
                {
                    ownerName = name;
                }

                if (saved.LoadoutShareId != null && saved.LoadoutShare != null)
                {
                    results.Add(new SavedShareUnifiedResponse(
                        saved.Id,
                        saved.LoadoutShare.ShareToken,
                        "loadout",
                        saved.LoadoutShare.Loadout.Name,
                        ownerName,
                        saved.SavedAt,
                        null
                    ));
                }
                else if (saved.FolderShareId != null && saved.FolderShare != null)
                {
                    // Use pre-fetched data instead of querying in loop
                    var ownerFolders = foldersByOwner.GetValueOrDefault(saved.FolderShare.OwnerUserId) ?? new List<Folder>();
                    var ownerLoadouts = loadoutsByOwner.GetValueOrDefault(saved.FolderShare.OwnerUserId) ?? new List<Loadout>();

                    // Build folder tree from pre-fetched data
                    var folderIds = shareService.CollectFolderIds(saved.FolderShare.FolderId, ownerFolders);
                    var foldersInTree = ownerFolders.Where(f => folderIds.Contains(f.Id)).ToList();
                    var loadoutsInTree = ownerLoadouts.Where(l => folderIds.Contains(l.FolderId)).ToList();
                    var unlockedChapters = new HashSet<int>(saved.FolderShare.GetUnlockedChapters());

                    results.Add(new SavedShareUnifiedResponse(
                        saved.Id,
                        saved.FolderShare.ShareToken,
                        "folder",
                        saved.FolderShare.Folder.Name,
                        ownerName,
                        saved.SavedAt,
                        shareService.BuildSharedFolderTree(saved.FolderShare.Folder, foldersInTree, loadoutsInTree, unlockedChapters, allActions)
                    ));
                }
            }

            return Results.Ok(results);
        })
        .RequireAuthorization()
        .WithName("GetSavedSharesUnified");

        return app;
    }
}
