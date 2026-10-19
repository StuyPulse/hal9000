// Turns raw library/server errors into short sentences a scout can act on.
// Anything already written for people passes through untouched.
const RULES: [RegExp, string][] = [
  [/mobile server|not available on this deployment|endpoint is not available/i, 'We cannot reach the server right now. Your work is safe on this phone.'],
  [/network request failed|failed to fetch|fetch failed|networkerror|internet connection appears|econnrefused|enotfound|network is unreachable|could not connect|load failed/i, 'No connection. Your work is saved on this phone and will send when you are back online.'],
  [/timed? ?out|timeout|aborterror|aborted/i, 'That took too long. Check your connection and try again.'],
  [/invalid login credentials|invalid_credentials|invalid email or password/i, 'That email or password is not right.'],
  [/email not confirmed|email_not_confirmed/i, 'Confirm your email first. Check your inbox for the link.'],
  [/user already registered|already been registered|already exists.*email|email.*already/i, 'An account with that email already exists. Try signing in instead.'],
  [/password should be|password.*at least|weak password|weak_password/i, 'Choose a longer, stronger password.'],
  [/signup.*disabled|not authorized|email address.*not authorized|authorized_emails|not on the allow|allowlist/i, 'This email has not been approved yet. Ask a team admin to add it.'],
  [/rate limit|too many requests|over_.*rate_limit|(?:http|status)\D{0,3}429/i, 'Too many tries. Wait a minute and try again.'],
  [/jwt expired|invalid jwt|auth session missing|refresh token|session.*expired|not authenticated|(?:http|status)\D{0,3}401|unauthorized|invalid claim/i, 'Your session ended. Sign in again to continue.'],
  [/row-level security|permission denied|\brls\b|forbidden|(?:http|status)\D{0,3}403|42501/i, 'Your account does not have permission to do that.'],
  [/duplicate key|already exists|unique constraint|23505|(?:http|status)\D{0,3}409/i, 'That already exists, so nothing was changed.'],
  [/violates (foreign key|check|not-null)|null value in column|invalid input syntax|23502|23503|23514|22p02/i, 'Something in this form is missing or invalid. Check it and try again.'],
  [/no rows|0 rows|pgrst116|cannot coerce the result|(?:http|status)\D{0,3}404/i, 'We could not find that. It may have been removed or you may not have access.'],
  [/(?:http|status)\D{0,3}5\d\d|internal server error|bad gateway|service unavailable|gateway|server error/i, 'The server had a problem. Try again in a moment.'],
  [/storage error|bucket|payload too large|(?:http|status)\D{0,3}413|file.*too (large|big)/i, 'That file could not be uploaded. Try a smaller photo.'],
  [/camera|permission.*(denied|required)|not granted/i, 'Allow access in your phone Settings and try again.'],
];

const TECHNICAL = /pgrst\d|sqlstate|relation "|column "|\bpostgres|violates|\bat \w+\.|undefined is not|null is not|\bTypeError\b|\bSyntaxError\b|\{"|\[object|json|\bexception\b|uuid|\bexpected\b.*\bgot\b/i;

export const GENERIC_ERROR = 'Something went wrong. Please try again.';

export function friendlyError(error: unknown, fallback = GENERIC_ERROR): string {
  const raw = typeof error === 'string' ? error : error instanceof Error ? error.message : typeof (error as { message?: unknown })?.message === 'string' ? (error as { message: string }).message : '';
  const text = raw.trim();
  if (!text) return fallback;
  for (const [pattern, message] of RULES) if (pattern.test(text)) return message;
  if (TECHNICAL.test(text) || text.length > 180) return fallback;
  return text;
}
