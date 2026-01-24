const fs = require('fs');
const path = require('path');

// Read all JSON files
const jobs = JSON.parse(fs.readFileSync('backend/GameData/jobs.json', 'utf8'));
const constructions = JSON.parse(fs.readFileSync('backend/GameData/constructions.json', 'utf8'));
const explorations = JSON.parse(fs.readFileSync('backend/GameData/explorations.json', 'utf8'));
const skills = JSON.parse(fs.readFileSync('backend/GameData/skills.json', 'utf8'));
const thresholds = JSON.parse(fs.readFileSync('backend/GameData/thresholds.json', 'utf8'));

// Convert to arrays and assign types
// Offset IDs to prevent collisions: Jobs 0-999, Constructions 10000-10999, Explorations 20000-20999
const jobsArray = Object.values(jobs).map(action => ({
  ...action,
  type: 0,
  originalId: action.id,
  id: action.id // Jobs keep their original IDs (0-68)
}));

const constructionsArray = Object.values(constructions).map(action => ({
  ...action,
  type: 1,
  originalId: action.id,
  id: 10000 + action.id // Constructions offset by 10000
}));

const explorationsArray = Object.values(explorations).map(action => ({
  ...action,
  type: 2,
  originalId: action.id,
  id: 20000 + action.id // Explorations offset by 20000
}));

// Combine all actions
const allActions = [...jobsArray, ...constructionsArray, ...explorationsArray];

console.log(`Processing ${allActions.length} total actions:`);
console.log(`  - ${jobsArray.length} jobs`);
console.log(`  - ${constructionsArray.length} constructions`);
console.log(`  - ${explorationsArray.length} explorations`);

// Determine chapter based on thresholds.json
function getChapter(originalId, actionType) {
  // Map action type to threshold property name
  const thresholdKey = actionType === 0 ? 'jobId' :
                       actionType === 1 ? 'constructionId' :
                       'explorationId';

  // Find the highest chapter whose threshold is <= originalId
  let chapter = 0;
  for (let i = 0; i <= 10; i++) {
    const threshold = thresholds[i.toString()];
    if (threshold && originalId >= threshold[thresholdKey]) {
      chapter = i;
    } else {
      break;
    }
  }

  return chapter;
}

// Get icon from skill
function getIcon(skillId) {
  const skill = skills[skillId];
  if (!skill || !skill.icon) {
    return 'fa-question';
  }
  return skill.icon;
}

// Generate C# code
let csharpCode = `using IncrelutionAutomationEditor.Api.Models;

namespace IncrelutionAutomationEditor.Api.Data;

public static class IncrelutionActionsData
{
    public static List<IncrelutionAction> GetActions()
    {
        return new List<IncrelutionAction>
        {
`;

allActions
  .sort((a, b) => a.id - b.id)
  .forEach((action, index) => {
    const chapter = getChapter(action.originalId, action.type);
    const icon = getIcon(action.skillId);
    const name = action.name.replace(/"/g, '\\"'); // Escape quotes
    const sortOrder = index + 1;

    csharpCode += `            new() { Id = ${action.id}, OriginalId = ${action.originalId}, Name = "${name}", Icon = "${icon}", Type = ${action.type}, SkillId = ${action.skillId}, Chapter = ${chapter}, SortOrder = ${sortOrder} },\n`;
  });

csharpCode += `        };
    }
}
`;

// Write to file
const outputPath = path.join('backend', 'Data', 'IncrelutionActionsData.cs');
fs.writeFileSync(outputPath, csharpCode, 'utf8');

console.log(`Generated ${allActions.length} actions`);
console.log(`Written to ${outputPath}`);
