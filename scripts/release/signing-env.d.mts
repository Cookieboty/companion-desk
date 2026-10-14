export declare const SECRET_NAMES: { mac: string[]; notarize: string[]; win: string[] };
export declare function resolveSigningEnv(
  platform: 'mac' | 'win' | 'linux',
  env: Record<string, string | undefined>,
): { vars: Record<string, string>; notes: string[]; signed: boolean; notarize: boolean };
