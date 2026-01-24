namespace IncrelutionAutomationEditor.Api.Models;

public class IncrelutionAction
{
    public int Id { get; set; }  // Unique database ID (offset by type: Jobs=0-999, Construction=10000+, Exploration=20000+)
    public int OriginalId { get; set; }  // Original ID from Increlution (0-based per type, for export)
    public required string Name { get; set; }
    public required string Icon { get; set; }  // Font Awesome class name (e.g., "fa-briefcase")
    public int Type { get; set; }  // 0=Jobs, 1=Construction, 2=Exploration
    public int SkillId { get; set; }
    public int Chapter { get; set; }
    public int SortOrder { get; set; }  // For maintaining order within chapters
}
