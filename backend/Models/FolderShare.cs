namespace IncrelutionAutomationEditor.Api.Models;

public class FolderShare
{
    public int Id { get; set; }
    public int FolderId { get; set; }
    public int OwnerUserId { get; set; }

    public string ShareToken { get; set; } = string.Empty;  // 16-char alphanumeric
    public DateTime CreatedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }               // null = never
    public bool ShowAttribution { get; set; } = true;
    public string UnlockedChapters { get; set; } = "[0]";  // JSON array of chapter numbers

    public Folder Folder { get; set; } = null!;

    public List<int> GetUnlockedChapters()
    {
        try
        {
            return System.Text.Json.JsonSerializer.Deserialize<List<int>>(UnlockedChapters) ?? new List<int> { 0 };
        }
        catch
        {
            return new List<int> { 0 };
        }
    }

    public void SetUnlockedChapters(List<int> chapters)
    {
        UnlockedChapters = System.Text.Json.JsonSerializer.Serialize(chapters);
    }
}
