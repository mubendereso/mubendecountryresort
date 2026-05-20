export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("Missing DATABASE_URL.");
  return value;
}
