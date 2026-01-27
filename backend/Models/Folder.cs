namespace IncrelutionAutomationEditor.Api.Models;

public class Folder
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public int? ParentId { get; set; }  // null = root folder
    public int? UserId { get; set; }  // null = anonymous user (for now)
    public DateTime CreatedAt { get; set; }
    public int SortOrder { get; set; }

    // Navigation properties
    public Folder? Parent { get; set; }
    public ICollection<Folder> SubFolders { get; set; } = new List<Folder>();
    public ICollection<Loadout> Loadouts { get; set; } = new List<Loadout>();
}
