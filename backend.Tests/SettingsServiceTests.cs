using System.Text.Json;
using IncrelutionAutomationEditor.Api.Data;
using IncrelutionAutomationEditor.Api.DTOs;
using IncrelutionAutomationEditor.Api.Services;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace IncrelutionAutomationEditor.Tests;

public class SettingsServiceTests
{
    private readonly SettingsService _sut = new(NullLogger<SettingsService>.Instance);

    #region GetUserSettings

    [Fact]
    public void GetUserSettings_ReturnsDefaults_WhenSettingsNull()
    {
        var user = new ApplicationUser { Settings = null };
        var settings = _sut.GetUserSettings(user);

        Assert.False(settings.InvertMouse);
        Assert.Empty(settings.DefaultSkillPriorities);
        Assert.Equal(new List<int> { 0 }, settings.UnlockedChapters);
    }

    [Fact]
    public void GetUserSettings_ReturnsDefaults_WhenSettingsEmpty()
    {
        var user = new ApplicationUser { Settings = "" };
        var settings = _sut.GetUserSettings(user);

        Assert.False(settings.InvertMouse);
    }

    [Fact]
    public void GetUserSettings_DeserializesValidJson()
    {
        var expected = new UserSettings
        {
            InvertMouse = true,
            UnlockedChapters = new List<int> { 0, 1, 2 },
        };
        var user = new ApplicationUser
        {
            Settings = JsonSerializer.Serialize(expected)
        };

        var settings = _sut.GetUserSettings(user);

        Assert.True(settings.InvertMouse);
        Assert.Equal(new List<int> { 0, 1, 2 }, settings.UnlockedChapters);
    }

    [Fact]
    public void GetUserSettings_ReturnsDefaults_WhenJsonInvalid()
    {
        var user = new ApplicationUser { Settings = "not valid json{{{" };
        var settings = _sut.GetUserSettings(user);

        // Should not throw, returns defaults
        Assert.False(settings.InvertMouse);
    }

    [Fact]
    public void GetUserSettings_ReturnsDefaults_WhenJsonIsArray()
    {
        var user = new ApplicationUser { Settings = "[1,2,3]" };
        var settings = _sut.GetUserSettings(user);

        Assert.False(settings.InvertMouse);
    }

    [Fact]
    public void GetUserSettings_HandlesPartialJson()
    {
        // JSON with only some fields set
        var user = new ApplicationUser { Settings = """{"InvertMouse":true}""" };
        var settings = _sut.GetUserSettings(user);

        Assert.True(settings.InvertMouse);
        Assert.Empty(settings.DefaultSkillPriorities);
    }

    #endregion
}
