const EXTERNAL_ALLOWED_EMAILS = new Set(["seb@sebastianw.tech", "dommasiello27@gmail.com"]);

export function isAuthorizedEmail(value: string) {
  const email = value.trim().toLowerCase();
  return email.endsWith("@stuypulse.com") || EXTERNAL_ALLOWED_EMAILS.has(email);
}
