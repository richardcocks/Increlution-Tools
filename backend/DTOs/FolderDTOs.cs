using System.ComponentModel.DataAnnotations;
using IncrelutionAutomationEditor.Api.Models;

namespace IncrelutionAutomationEditor.Api.DTOs;

public record FolderTreeNode(
    int Id,
    string Name,
    int? ParentId,
    List<FolderTreeNode> SubFolders,
    List<LoadoutSummary> Loadouts
);

public record LoadoutSummary(
    int Id,
    string Name,
    DateTime UpdatedAt,
    bool IsProtected
);

public record CreateFolderRequest(
    [property: Required(ErrorMessage = "Folder name is required")]
    [property: MinLength(1, ErrorMessage = "Folder name cannot be empty")]
    [property: MaxLength(100, ErrorMessage = "Folder name cannot exceed 100 characters")]
    string Name,

    int ParentId
);

public record RenameFolderRequest(
    [property: Required(ErrorMessage = "Folder name is required")]
    [property: MinLength(1, ErrorMessage = "Folder name cannot be empty")]
    [property: MaxLength(100, ErrorMessage = "Folder name cannot exceed 100 characters")]
    string Name
);

public record CreateLoadoutRequest(
    [property: Required(ErrorMessage = "Loadout name is required")]
    [property: MinLength(1, ErrorMessage = "Loadout name cannot be empty")]
    [property: MaxLength(100, ErrorMessage = "Loadout name cannot exceed 100 characters")]
    string Name,

    int FolderId
);
