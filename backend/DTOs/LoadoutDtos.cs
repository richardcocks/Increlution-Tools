using System.ComponentModel.DataAnnotations;
using IncrelutionAutomationEditor.Api.Models;

namespace IncrelutionAutomationEditor.Api.DTOs;

public record UpdateActionRequest(
    int LoadoutId,

    [property: Range(0, 2, ErrorMessage = "Action type must be 0, 1, or 2")]
    int ActionType,

    int ActionId,

    [property: Range(0, 4, ErrorMessage = "Automation level must be between 0 and 4")]
    int? AutomationLevel
);

public record UpdateLoadoutNameRequest(
    [property: Required(ErrorMessage = "Loadout name is required")]
    [property: MinLength(1, ErrorMessage = "Loadout name cannot be empty")]
    [property: MaxLength(100, ErrorMessage = "Loadout name cannot exceed 100 characters")]
    string Name
);

public record UpdateLoadoutProtectionRequest(bool IsProtected);

public record ImportLoadoutRequest(LoadoutData Data);

public record MoveLoadoutRequest(int FolderId);

public record MoveFolderRequest(int ParentId);

public record UnlockChapterRequest(
    [property: Range(1, 10, ErrorMessage = "Chapter must be between 1 and 10")]
    int Chapter,

    [property: Required(ErrorMessage = "Exploration name is required")]
    [property: MinLength(1, ErrorMessage = "Exploration name cannot be empty")]
    [property: MaxLength(100, ErrorMessage = "Exploration name cannot exceed 100 characters")]
    string ExplorationName
);

public record UnlockChapterResponse(bool Success, string Message, List<int>? UnlockedChapters = null);

public record CreateShareRequest(
    [property: Range(1, 8760, ErrorMessage = "Expiration must be between 1 hour and 1 year")]
    int? ExpiresInHours,

    bool ShowAttribution = true
);

public record LoadoutShareResponse(int Id, string ShareToken, DateTime CreatedAt, DateTime? ExpiresAt, bool ShowAttribution);

public record UserShareResponse(int Id, string ShareToken, int LoadoutId, string LoadoutName, DateTime CreatedAt, DateTime? ExpiresAt, bool ShowAttribution);

public record SharedLoadoutResponse(string Name, LoadoutData Data, DateTime UpdatedAt, string? OwnerName);

public record SharedLoadoutErrorResponse(string Error);

public record SavedShareResponse(int Id, string ShareToken, string LoadoutName, string? OwnerName, DateTime SavedAt);
