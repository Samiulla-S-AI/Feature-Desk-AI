// ===================================================================
// Local-device gate for the CV microservice.
// The CV feature must ONLY appear on a local device (laptop/tablet running
// the app locally) and be fully hidden on the deployed web host (Netlify).
// ===================================================================

export function isLocalDevice(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h.endsWith(".local") ||
    /^192\.168\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}
