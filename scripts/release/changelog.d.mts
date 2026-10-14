export declare function parseChangeset(
  text: string,
): { packages: Record<string, string>; summary: string } | null;
export declare function classify(summary: string): {
  section: string;
  line: string;
  breaking: boolean;
};
export declare function renderUnreleased(
  changesets: { packages: Record<string, string>; summary: string }[],
): string;
export declare function readChangesets(
  dir?: string,
): { packages: Record<string, string>; summary: string }[];
export declare function buildChangelog(existing: string | null, unreleased: string): string;
export declare function release(text: string, version: string, date: string): string;
