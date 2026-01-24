namespace IncrelutionAutomationEditor.Api.DTOs;

/// <summary>
/// User settings for the automation editor
/// </summary>
public record UserSettings
{
    /// <summary>
    /// When true, click decreases and right-click increases (inverted from default)
    /// </summary>
    public bool InvertMouse { get; init; } = false;

    /// <summary>
    /// Default skill priorities for new loadouts. Keys are "skillId-actionType" (e.g., "5-0"), values are automation levels (0-4)
    /// </summary>
    public Dictionary<string, int> DefaultSkillPriorities { get; init; } = new();

    /// <summary>
    /// Tracks whether skill priorities have been initialized (prevents re-initialization after Clear All)
    /// </summary>
    public bool SkillPrioritiesInitialized { get; init; } = false;

    /// <summary>
    /// When true, applies default priorities to null values when importing
    /// </summary>
    public bool ApplyDefaultsOnImport { get; init; } = false;

    /// <summary>
    /// List of action IDs that the user has marked as favourites
    /// </summary>
    public List<int> FavouriteActions { get; init; } = new();

    /// <summary>
    /// List of chapter numbers (0-10) that the user has unlocked.
    /// Chapter 0 is always unlocked by default.
    /// </summary>
    public List<int> UnlockedChapters { get; init; } = new() { 0 };

    /// <summary>
    /// Theme preference: "system" (default), "dark", or "light"
    /// </summary>
    public string ThemePreference { get; init; } = "system";
}
