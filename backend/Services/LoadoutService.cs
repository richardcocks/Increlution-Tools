using IncrelutionAutomationEditor.Api.DTOs;
using IncrelutionAutomationEditor.Api.Models;

namespace IncrelutionAutomationEditor.Api.Services;

public class LoadoutService
{
    /// <summary>
    /// Builds default loadout data based on user's default skill priorities and unlocked chapters.
    /// </summary>
    public Dictionary<string, Dictionary<string, int>> BuildDefaultLoadoutData(
        UserSettings settings,
        IEnumerable<IncrelutionAction> allActions)
    {
        var data = new Dictionary<string, Dictionary<string, int>>();

        if (settings.DefaultSkillPriorities.Count == 0)
            return data;

        // Get unlocked chapters (default to just chapter 0)
        var unlockedChapters = new HashSet<int>(settings.UnlockedChapters.Count > 0
            ? settings.UnlockedChapters
            : new List<int> { 0 });

        // Apply default priorities based on skill and action type, but only for unlocked chapters
        foreach (var action in allActions)
        {
            // Skip actions from locked chapters
            if (!unlockedChapters.Contains(action.Chapter))
                continue;

            var key = $"{action.SkillId}-{action.Type}";
            if (settings.DefaultSkillPriorities.TryGetValue(key, out var priority))
            {
                var typeKey = action.Type.ToString();
                if (!data.ContainsKey(typeKey))
                    data[typeKey] = new Dictionary<string, int>();
                data[typeKey][action.OriginalId.ToString()] = priority;
            }
        }

        return data;
    }
}
