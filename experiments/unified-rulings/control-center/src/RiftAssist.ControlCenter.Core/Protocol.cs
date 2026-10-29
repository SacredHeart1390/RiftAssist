using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace RiftAssist.ControlCenter.Core;

public sealed class ControlException(string code, bool uncertain = false) : Exception(code)
{
    public string Code { get; } = code;
    public bool Uncertain { get; } = uncertain;
}

public static class ProtocolJson
{
    public static readonly UTF8Encoding Utf8 = new(false, true);
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        MaxDepth = 32
    };
    public static JsonElement Element(object? value) => JsonSerializer.SerializeToElement(value, Options);
    public static string Canonical(JsonElement value)
    {
        var output = new StringBuilder();
        try { Write(value, output, 0); } catch (InvalidOperationException) { throw new ControlException("client-json-unicode"); }
        return output.ToString();
    }
    public static byte[] CanonicalBytes(JsonElement value) => Utf8.GetBytes(Canonical(value));
    private static uint? IndexKey(string key) => uint.TryParse(key, NumberStyles.None, CultureInfo.InvariantCulture, out var n)
        && n != uint.MaxValue && n.ToString(CultureInfo.InvariantCulture) == key ? n : null;
    private static void Write(JsonElement value, StringBuilder output, int depth)
    {
        if (depth > 32) throw new ControlException("client-json-depth");
        switch (value.ValueKind)
        {
            case JsonValueKind.Object:
                var properties = value.EnumerateObject().ToArray();
                if (properties.Select(p => p.Name).Distinct(StringComparer.Ordinal).Count() != properties.Length)
                    throw new ControlException("client-json-duplicate-key");
                // Object.fromEntries/JSON.stringify enumerates array-index property names first.
                var sorted = properties.OrderBy(p => IndexKey(p.Name).HasValue ? 0 : 1)
                    .ThenBy(p => IndexKey(p.Name) ?? 0).ThenBy(p => p.Name, StringComparer.Ordinal).ToArray();
                output.Append('{');
                for (var i = 0; i < sorted.Length; i++)
                {
                    if (i > 0) output.Append(','); String(sorted[i].Name, output); output.Append(':'); Write(sorted[i].Value, output, depth + 1);
                }
                output.Append('}'); break;
            case JsonValueKind.Array:
                output.Append('['); var first = true;
                foreach (var row in value.EnumerateArray()) { if (!first) output.Append(','); first = false; Write(row, output, depth + 1); }
                output.Append(']'); break;
            case JsonValueKind.String: String(value.GetString()!, output); break;
            case JsonValueKind.Number:
                var n = value.GetDouble();
                // Control protocol numbers are safe integers (times, versions, offsets), never money/floats.
                if (!double.IsFinite(n) || Math.Truncate(n) != n || Math.Abs(n) > 9007199254740991d) throw new ControlException("client-json-number");
                output.Append(((long)n).ToString(CultureInfo.InvariantCulture)); break;
            case JsonValueKind.True: output.Append("true"); break;
            case JsonValueKind.False: output.Append("false"); break;
            case JsonValueKind.Null: output.Append("null"); break;
            default: throw new ControlException("client-json-value");
        }
    }
    private static void String(string value, StringBuilder output)
    {
        output.Append('"');
        for (var i = 0; i < value.Length; i++)
        {
            var c = value[i];
            switch (c)
            {
                case '"': output.Append("\\\""); break;
                case '\\': output.Append("\\\\"); break;
                case '\b': output.Append("\\b"); break;
                case '\f': output.Append("\\f"); break;
                case '\n': output.Append("\\n"); break;
                case '\r': output.Append("\\r"); break;
                case '\t': output.Append("\\t"); break;
                default:
                    if (c < 32) output.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    else if (char.IsHighSurrogate(c))
                    {
                        if (i + 1 >= value.Length || !char.IsLowSurrogate(value[i + 1])) throw new ControlException("client-json-unicode");
                        output.Append(c).Append(value[++i]);
                    }
                    else if (char.IsLowSurrogate(c)) throw new ControlException("client-json-unicode");
                    else output.Append(c);
                    break;
            }
        }
        output.Append('"');
    }
    public static string Sign(JsonElement payload, string keyText) => Convert.ToHexStringLower(
        HMACSHA256.HashData(Utf8.GetBytes(keyText), CanonicalBytes(payload)));
}

public sealed class SessionSigner : IDisposable
{
    private string? secret = Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(32));
    public string SessionId { get; } = Guid.NewGuid().ToString("D");
    public string Actor { get; }
    public IReadOnlyList<string> Scopes { get; }
    public SessionSigner(bool allowFinalActions, bool operations = false)
    {
        Actor = "local-development-operator";
        Scopes = operations ? ["operations:read", "operations:write"] : ["review:read", "review:decide", "cards:stage", "audit:read", ..allowFinalActions ? new[] { "cards:activate", "cards:rollback" } : []];
    }
    public string Bootstrap() => JsonSerializer.Serialize(new { sessionId = SessionId, credentials = new[] { new { id = "control-center", actor = Actor, scopes = Scopes, secret } } }, ProtocolJson.Options);
    public string Request(string method, object parameters, string requestId, long? issuedAt = null, string? nonce = null)
    {
        if (secret is null) throw new ObjectDisposedException(nameof(SessionSigner));
        if (!Guid.TryParseExact(requestId, "D", out _)) throw new ControlException("client-request-id");
        var payload = ProtocolJson.Element(new { protocol = "riftassist-control-1", sessionId = SessionId, credentialId = "control-center", requestId,
            nonce = nonce ?? Guid.NewGuid().ToString("D"), issuedAt = issuedAt ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), method, @params = parameters });
        var fields = payload.EnumerateObject().ToDictionary(p => p.Name, p => (object?)p.Value.Clone());
        fields["signature"] = ProtocolJson.Sign(payload, secret);
        var message = JsonSerializer.Serialize(fields, ProtocolJson.Options);
        if (ProtocolJson.Utf8.GetByteCount(message) > 1048576) throw new ControlException("client-request-limit");
        return message;
    }
    public void Dispose() { secret = null; } // Managed string copies are not claimed to be securely erased.
}
