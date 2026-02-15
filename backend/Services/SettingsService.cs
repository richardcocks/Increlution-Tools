using System.Text.Json;
using IncrelutionAutomationEditor.Api.Data;
using IncrelutionAutomationEditor.Api.DTOs;
using Microsoft.EntityFrameworkCore;

namespace IncrelutionAutomationEditor.Api.Services;

public class SettingsService
{
    private readonly ILogger<SettingsService> _logger;

    public SettingsService(ILogger<SettingsService> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Safely deserializes user settings from the ApplicationUser's Settings JSON string.
    /// Returns default settings if the string is null, empty, or fails to parse.
    /// </summary>
    public UserSettings GetUserSettings(ApplicationUser user)
    {
        if (string.IsNullOrEmpty(user.Settings))
            return new UserSettings();

        try
        {
            return JsonSerializer.Deserialize<UserSettings>(user.Settings) ?? new UserSettings();
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "Failed to deserialize settings for user {UserId}", user.Id);
            return new UserSettings();
        }
    }

    /// <summary>
    /// Gets the unlocked chapters for a user. Returns [0] if settings can't be read.
    /// </summary>
    public async Task<List<int>> GetUnlockedChaptersAsync(int userId, IdentityAppDbContext identityDb)
    {
        var appUser = await identityDb.Users.FindAsync(userId);
        if (appUser == null)
            return new List<int> { 0 };

        var settings = GetUserSettings(appUser);
        return settings.UnlockedChapters.Count > 0 ? settings.UnlockedChapters : new List<int> { 0 };
    }
}
