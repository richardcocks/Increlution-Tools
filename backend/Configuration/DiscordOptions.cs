namespace IncrelutionAutomationEditor.Api.Configuration;

public class DiscordOptions
{
    public const string SectionName = "Discord";

    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string RedirectUri { get; set; } = string.Empty;
    public string FrontendUrl { get; set; } = "http://localhost:5173";

    // Discord OAuth2 endpoints
    public string AuthorizationEndpoint => "https://discord.com/api/oauth2/authorize";
    public string TokenEndpoint => "https://discord.com/api/oauth2/token";
    public string UserInfoEndpoint => "https://discord.com/api/users/@me";
}
