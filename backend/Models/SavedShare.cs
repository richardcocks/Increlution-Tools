namespace IncrelutionAutomationEditor.Api.Models;

public class SavedShare
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int LoadoutShareId { get; set; }
    public DateTime SavedAt { get; set; }

    public LoadoutShare LoadoutShare { get; set; } = null!;
}
