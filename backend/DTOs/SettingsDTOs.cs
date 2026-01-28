using System.ComponentModel.DataAnnotations;

namespace IncrelutionAutomationEditor.Api.DTOs;

/// <summary>
/// Valid theme preference values
/// </summary>
public static class ThemePreferences
{
    public const string System = "system";
    public const string Dark = "dark";
    public const string Light = "light";

    private static readonly HashSet<string> ValidValues = new() { System, Dark, Light };

    public static bool IsValid(string? value) => value != null && ValidValues.Contains(value);

    public static string Sanitize(string? value) => IsValid(value) ? value! : System;
}

/// <summary>
/// Valid color mode values for automation wheels
/// </summary>
public static class ColorModes
{
    public const string Full = "full";
    public const string Greyscale = "greyscale";
    public const string BlackAndWhite = "blackAndWhite";

    private static readonly HashSet<string> ValidValues = new() { Full, Greyscale, BlackAndWhite };

    public static bool IsValid(string? value) => value != null && ValidValues.Contains(value);

    public static string Sanitize(string? value) => IsValid(value) ? value! : Full;
}

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
    /// When true, null values in imported data overwrite existing values.
    /// When false (default), null values in imports are ignored and existing values are preserved.
    /// </summary>
    public bool OverwriteWhenNull { get; init; } = false;

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
    [StringLength(10)]
    public string ThemePreference { get; init; } = ThemePreferences.System;

    /// <summary>
    /// When true, disables the needle rotation animation on automation wheels
    /// </summary>
    public bool DisableWheelAnimation { get; init; } = false;

    /// <summary>
    /// Color mode for automation wheels: "full" (default), "greyscale", or "blackAndWhite"
    /// </summary>
    [StringLength(20)]
    public string ColorMode { get; init; } = ColorModes.Full;

    /// <summary>
    /// Returns a copy of the settings with validated/sanitized values
    /// </summary>
    public UserSettings Sanitized() => this with
    {
        ThemePreference = ThemePreferences.Sanitize(ThemePreference),
        ColorMode = ColorModes.Sanitize(ColorMode)
    };
}
