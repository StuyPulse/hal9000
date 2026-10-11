export async function isAuthorizedEmail(value: string, lookup: (email: string) => Promise<boolean>) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  return email.endsWith("@stuypulse.com") || lookup(email);
}
