using System.Security.Claims;
using IncrelutionAutomationEditor.Api.Data;
using IncrelutionAutomationEditor.Api.DTOs;
using IncrelutionAutomationEditor.Api.Services;
using IncrelutionAutomationEditor.Api.Utils;
namespace IncrelutionAutomationEditor.Api.Endpoints;

public static class SettingsEndpoints
{
    public static WebApplication MapSettingsEndpoints(this WebApplication app)
    {
        // GET /api/settings - Get user settings
        app.MapGet("/api/settings", async (ClaimsPrincipal user, IdentityAppDbContext identityDb, SettingsService settingsService) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var appUser = await identityDb.Users.FindAsync(userId);
            if (appUser == null)
                return Results.NotFound("User not found");

            return Results.Ok(settingsService.GetUserSettings(appUser));
        })
        .RequireAuthorization()
        .WithName("GetSettings");

        // PUT /api/settings - Update user settings
        app.MapPut("/api/settings", async (UserSettings settings, ClaimsPrincipal user, IdentityAppDbContext identityDb) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var appUser = await identityDb.Users.FindAsync(userId);
            if (appUser == null)
                return Results.NotFound("User not found");

            var sanitizedSettings = settings.Sanitized();
            appUser.Settings = System.Text.Json.JsonSerializer.Serialize(sanitizedSettings);
            await identityDb.SaveChangesAsync();

            return Results.Ok(sanitizedSettings);
        })
        .RequireAuthorization()
        .WithName("UpdateSettings");

        // POST /api/settings/unlock-chapter - Attempt to unlock a chapter by providing the first exploration name
        app.MapPost("/api/settings/unlock-chapter", async (
            UnlockChapterRequest request,
            ClaimsPrincipal user,
            IdentityAppDbContext identityDb,
            GameDataService gameData,
            SettingsService settingsService) =>
        {
            var userId = EndpointHelpers.GetUserId(user);
            var appUser = await identityDb.Users.FindAsync(userId);
            if (appUser == null)
                return Results.NotFound("User not found");

            // Validate chapter number (1-10, chapter 0 is always unlocked)
            if (request.Chapter < 1 || request.Chapter > 10)
                return Results.BadRequest(new UnlockChapterResponse(false, "Invalid chapter number"));

            // Get the expected exploration name for this chapter
            var expectedName = gameData.GetFirstExplorationName(request.Chapter);
            if (expectedName == null)
                return Results.BadRequest(new UnlockChapterResponse(false, "Chapter not found"));

            // Validate the guess using fuzzy matching
            if (!StringUtils.FuzzyMatch(request.ExplorationName, expectedName))
                return Results.Ok(new UnlockChapterResponse(false, "Incorrect exploration name"));

            // Load current settings
            var settings = settingsService.GetUserSettings(appUser);

            // Ensure unlocked chapters includes 0 and add new chapter + all previous
            var unlocked = new HashSet<int>(settings.UnlockedChapters) { 0 };
            for (var i = 0; i <= request.Chapter; i++)
            {
                unlocked.Add(i);
            }

            // Update settings with new unlocked chapters
            var newSettings = settings with { UnlockedChapters = unlocked.OrderBy(c => c).ToList() };
            appUser.Settings = System.Text.Json.JsonSerializer.Serialize(newSettings);
            await identityDb.SaveChangesAsync();

            return Results.Ok(new UnlockChapterResponse(true, "Chapter unlocked!", newSettings.UnlockedChapters));
        })
        .RequireAuthorization()
        .RequireRateLimiting("auth")
        .WithName("UnlockChapter");

        return app;
    }
}
