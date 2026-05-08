const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const encodeSyncTransportValue = (value: unknown): unknown => {
  if (value === undefined) return ['u'];
  if (value === null) return ['n'];
  if (typeof value === 'number' && Number.isNaN(value)) return ['nan'];
  if (Array.isArray(value)) return value.map(encodeSyncTransportValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeSyncTransportValue(child)]));
  }
  return value;
};

export const decodeSyncTransportValue = (value: unknown): unknown => {
  if (Array.isArray(value) && value.length === 1 && value[0] === 'u') return undefined;
  if (Array.isArray(value) && value.length === 1 && value[0] === 'n') return null;
  if (Array.isArray(value) && value.length === 1 && value[0] === 'nan') return Number.NaN;
  if (Array.isArray(value)) return value.map(decodeSyncTransportValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decodeSyncTransportValue(child)]));
  }
  return value;
};
