namespace IncrelutionAutomationEditor.Api.Models;

// In-memory action data (not persisted to database)
public class ActionData
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public int Type { get; set; }  // 0=Jobs, 1=Construction, 2=Exploration
    public int SkillId { get; set; }
}
