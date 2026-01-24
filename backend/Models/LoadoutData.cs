namespace IncrelutionAutomationEditor.Api.Models;

// Dictionary<ActionType, Dictionary<ActionId, AutomationLevel>>
// Matches the Increlution export format exactly
public class LoadoutData : Dictionary<int, Dictionary<int, int?>>
{
    public LoadoutData() : base() { }
}
