export function logJson(
  level: string,
  message: string,
  fields: Record<string, unknown> = {},
): void {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      service: 'solana-pump-worker',
      ...fields,
    }),
  );
}
