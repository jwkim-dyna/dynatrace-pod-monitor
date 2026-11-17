import type { ThemeType } from '@dynatrace-sdk/user-preferences';

export function resolveTheme(preference: ThemeType, prefersDark: boolean): 'light' | 'dark' {
  return preference === 'light' || preference === 'dark' ? preference : prefersDark ? 'dark' : 'light';
}
