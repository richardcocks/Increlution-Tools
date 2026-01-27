using System.Text.Json;

namespace IncrelutionAutomationEditor.Api.Models;

public class Loadout
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public int FolderId { get; set; }
    public int? UserId { get; set; }  // null = anonymous user (for now)
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public bool IsProtected { get; set; } = false;
    public int SortOrder { get; set; }

    // JSON column storing the automation settings
    // Dictionary<ActionType, Dictionary<ActionId, AutomationLevel>>
    public string Data { get; set; } = "{}";

    // Navigation properties
    public Folder Folder { get; set; } = null!;

    // Helper to get/set the loadout data
    public LoadoutData GetData()
    {
        if (string.IsNullOrEmpty(Data))
            return new LoadoutData();

        return JsonSerializer.Deserialize<LoadoutData>(Data) ?? new LoadoutData();
    }

    public void SetData(LoadoutData data)
    {
        Data = JsonSerializer.Serialize(data);
    }
}
