namespace IncrelutionAutomationEditor.Api.Models;

public class LoadoutActionSetting
{
    public int Id { get; set; }
    public int LoadoutId { get; set; }
    public int ActionId { get; set; }  // References in-memory action by offset ID
    public int? AutomationLevel { get; set; }  // null=No override, 0=Off, 1=Low, 2=Regular, 3=High, 4=Top

    // Navigation properties
    public Loadout Loadout { get; set; } = null!;
}
