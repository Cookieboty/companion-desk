/**
 * 允许的模型许可（SPDX）。与仓库根目录 assets-licenses.json 的 allowedLicenses 保持一致
 * （单测会校验），远程目录条目不在此列表的一律丢弃。
 */
export const ALLOWED_MODEL_LICENSES: readonly string[] = [
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-SA-4.0',
  'MIT',
  'Apache-2.0',
  'OFL-1.1',
];

export function isAllowedLicense(spdx: unknown): spdx is string {
  return typeof spdx === 'string' && ALLOWED_MODEL_LICENSES.includes(spdx);
}
