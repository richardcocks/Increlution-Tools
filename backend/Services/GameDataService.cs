using System.Text.Json;
using IncrelutionAutomationEditor.Api.Models;

namespace IncrelutionAutomationEditor.Api.Services;

public class GameDataService
{
    private readonly List<ActionData> _actions = new();
    private readonly Dictionary<int, Skill> _skills = new();
    private readonly Dictionary<int, Dictionary<string, int>> _thresholds = new();

    public GameDataService()
    {
        LoadData();
    }

    private void LoadData()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        // Load skills
        var skillsJson = File.ReadAllText("GameData/skills.json");
        var skillsDict = JsonSerializer.Deserialize<Dictionary<string, Skill>>(skillsJson, options);
        if (skillsDict != null)
        {
            foreach (var kvp in skillsDict)
            {
                var skill = kvp.Value;
                skill.Id = int.Parse(kvp.Key);
                _skills[skill.Id] = skill;
            }
        }

        // Load thresholds
        var thresholdsJson = File.ReadAllText("GameData/thresholds.json");
        var thresholdsDict = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, int>>>(thresholdsJson, options);
        if (thresholdsDict != null)
        {
            foreach (var kvp in thresholdsDict)
            {
                _thresholds[int.Parse(kvp.Key)] = kvp.Value;
            }
        }

        // Load actions
        LoadActionsFromFile("GameData/jobs.json", 0);           // Type 0 = Jobs
        LoadActionsFromFile("GameData/constructions.json", 1);   // Type 1 = Construction
        LoadActionsFromFile("GameData/explorations.json", 2);    // Type 2 = Exploration
    }

    private void LoadActionsFromFile(string filename, int actionType)
    {
        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };

        var json = File.ReadAllText(filename);
        var actionsDict = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json, options);

        if (actionsDict == null) return;

        foreach (var kvp in actionsDict)
        {
            var id = int.Parse(kvp.Key);
            var actionJson = kvp.Value;

            var action = new ActionData
            {
                Id = id,
                Name = actionJson.GetProperty("name").GetString() ?? "",
                Type = actionType,
                SkillId = actionJson.GetProperty("skillId").GetInt32()
            };

            _actions.Add(action);
        }
    }

    public List<IncrelutionAction> GetAllActions()
    {
        return _actions
            .Select(action => new IncrelutionAction
            {
                Id = GetOffsetId(action.Id, action.Type),
                OriginalId = action.Id,
                Name = action.Name,
                Icon = GetIconForAction(action),
                Type = action.Type,
                SkillId = action.SkillId,
                Chapter = GetChapter(action.Id, action.Type),
                SortOrder = action.Id
            })
            .OrderBy(a => a.Type)
            .ThenBy(a => a.Chapter)
            .ThenBy(a => a.SortOrder)
            .ToList();
    }

    private int GetOffsetId(int originalId, int actionType)
    {
        return actionType switch
        {
            0 => originalId,              // Jobs: 0-999
            1 => 10000 + originalId,      // Construction: 10000+
            2 => 20000 + originalId,      // Exploration: 20000+
            _ => originalId
        };
    }

    private string GetIconForAction(ActionData action)
    {
        if (_skills.TryGetValue(action.SkillId, out var skill))
        {
            return skill.Icon;
        }
        return "fa-question";
    }

    private int GetChapter(int originalId, int actionType)
    {
        var thresholdKey = actionType switch
        {
            0 => "jobId",
            1 => "constructionId",
            2 => "explorationId",
            _ => "jobId"
        };

        int chapter = 0;
        for (int i = 0; i <= 10; i++)
        {
            if (_thresholds.TryGetValue(i, out var threshold) &&
                threshold.TryGetValue(thresholdKey, out var thresholdValue) &&
                originalId >= thresholdValue)
            {
                chapter = i;
            }
            else
            {
                break;
            }
        }

        return chapter;
    }

    public Skill? GetSkill(int skillId)
    {
        return _skills.GetValueOrDefault(skillId);
    }

    public Dictionary<int, Skill> GetAllSkills()
    {
        return _skills;
    }

    /// <summary>
    /// Gets the name of the first exploration in a given chapter.
    /// Used for chapter unlock validation.
    /// </summary>
    public string? GetFirstExplorationName(int chapter)
    {
        if (!_thresholds.TryGetValue(chapter, out var threshold))
            return null;

        if (!threshold.TryGetValue("explorationId", out var explorationId))
            return null;

        // Find the exploration with this originalId (type 2 = exploration)
        var exploration = _actions.FirstOrDefault(a => a.Id == explorationId && a.Type == 2);
        return exploration?.Name;
    }
}
