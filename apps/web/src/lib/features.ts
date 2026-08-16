export function featureEnabled(
  name: "FEATURE_LIBRARY" | "FEATURE_WEBHOOKS" | "DEBUG_IMPACT",
): boolean {
  return process.env[name] === "1";
}
