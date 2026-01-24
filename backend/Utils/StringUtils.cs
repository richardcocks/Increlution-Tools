namespace IncrelutionAutomationEditor.Api.Utils;

public static class StringUtils
{
    /// <summary>
    /// Calculates the Levenshtein distance between two strings.
    /// This measures the minimum number of single-character edits needed
    /// to transform one string into another.
    /// </summary>
    public static int LevenshteinDistance(string s1, string s2)
    {
        var n = s1.Length;
        var m = s2.Length;
        var d = new int[n + 1, m + 1];

        for (var i = 0; i <= n; i++) d[i, 0] = i;
        for (var j = 0; j <= m; j++) d[0, j] = j;

        for (var i = 1; i <= n; i++)
        {
            for (var j = 1; j <= m; j++)
            {
                var cost = char.ToLowerInvariant(s1[i - 1]) == char.ToLowerInvariant(s2[j - 1]) ? 0 : 1;
                d[i, j] = Math.Min(
                    Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1),
                    d[i - 1, j - 1] + cost);
            }
        }
        return d[n, m];
    }

    /// <summary>
    /// Performs fuzzy string matching with case-insensitive comparison
    /// and tolerance for typos based on string length.
    /// </summary>
    public static bool FuzzyMatch(string input, string target, int baseMaxDistance = 2)
    {
        var normalizedInput = input.Trim();
        var normalizedTarget = target.Trim();

        // Exact match (case insensitive)
        if (string.Equals(normalizedInput, normalizedTarget, StringComparison.OrdinalIgnoreCase))
            return true;

        // Calculate Levenshtein distance
        var distance = LevenshteinDistance(normalizedInput, normalizedTarget);

        // Scale max distance based on string length for longer names
        // Short names (< 12 chars): max distance = baseMaxDistance (2)
        // Longer names: allow more typos proportionally
        var effectiveMaxDistance = Math.Max(baseMaxDistance, target.Length / 6);

        return distance <= effectiveMaxDistance;
    }
}
