using System.Text.Json.Serialization;

namespace IncrelutionAutomationEditor.Api.DTOs;

public record AuthResponse(bool Success, string? Message = null);

// Updated UserInfo - uses Discord username instead of email
public record UserInfo(int Id, string Username);

// Discord API response types
public record DiscordTokenResponse(
    [property: JsonPropertyName("access_token")] string AccessToken,
    [property: JsonPropertyName("token_type")] string TokenType,
    [property: JsonPropertyName("expires_in")] int ExpiresIn,
    [property: JsonPropertyName("refresh_token")] string? RefreshToken,
    [property: JsonPropertyName("scope")] string Scope
);

public record DiscordUser(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("username")] string Username,
    [property: JsonPropertyName("global_name")] string? GlobalName,
    [property: JsonPropertyName("avatar")] string? Avatar,
    [property: JsonPropertyName("discriminator")] string Discriminator
);
