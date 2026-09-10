export type LogFields = Record<string, unknown>;

function sanitize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('private') ||
      lower.includes('secret') ||
      lower.includes('privatekey') ||
      lower === 'pk'
    ) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function logJson(
  level: 'info' | 'warn' | 'error',
  message: string,
  fields: LogFields = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    component: 'fee-keeper',
    message,
    ...sanitize(fields),
  });
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}
