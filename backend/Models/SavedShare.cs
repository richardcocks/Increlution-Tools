namespace IncrelutionAutomationEditor.Api.Models;

public class SavedShare
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public DateTime SavedAt { get; set; }

    // One of these must be set (enforced via check constraint)
    public int? LoadoutShareId { get; set; }
    public int? FolderShareId { get; set; }

    public LoadoutShare? LoadoutShare { get; set; }
    public FolderShare? FolderShare { get; set; }
}
