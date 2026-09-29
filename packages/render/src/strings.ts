/**
 * D-014: alphaTab numbers strings from the lowest one (Note.string 1 = low E),
 * we number them from the highest. Only this package converts.
 */
export function toAlphaTabString(ourString: number, stringCount: number): number {
  return stringCount + 1 - ourString;
}

export function toOurString(alphaTabString: number, stringCount: number): number {
  return stringCount + 1 - alphaTabString;
}
