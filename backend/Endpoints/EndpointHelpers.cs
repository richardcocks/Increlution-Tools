using System.Security.Claims;

namespace IncrelutionAutomationEditor.Api.Endpoints;

public static class EndpointHelpers
{
    public static int GetUserId(ClaimsPrincipal user) =>
        int.Parse(user.FindFirstValue(ClaimTypes.NameIdentifier)!);
}
