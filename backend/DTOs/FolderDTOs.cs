using System.ComponentModel.DataAnnotations;
using IncrelutionAutomationEditor.Api.Models;

namespace IncrelutionAutomationEditor.Api.DTOs;

public record FolderTreeNode(
    int Id,
    string Name,
    int? ParentId,
    bool IsReadOnly,
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

public record DuplicateLoadoutResponse(
    int Id,
    string Name,
    int FolderId,
    DateTime UpdatedAt,
    bool IsProtected
);

public record DuplicateFolderResponse(
    int Id,
    string Name,
    int? ParentId,
    int TotalFoldersCopied,
    int TotalLoadoutsCopied
);

public record DeleteFolderResponse(
    int FoldersDeleted,
    int LoadoutsDeleted,
    int ProtectedLoadoutsMoved
);

public record SetFolderReadOnlyRequest(
    bool IsReadOnly
);

public record ReorderRequest(
    [property: Required(ErrorMessage = "Item type is required")]
    string ItemType,  // "folder" or "loadout"

    [property: Required(ErrorMessage = "Ordered IDs are required")]
    List<int> OrderedIds
);
