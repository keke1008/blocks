// localStorage that never throws: storage can be unavailable (private mode),
// in which case reads come back empty and writes last for this session only.

export function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // See above.
  }
}
