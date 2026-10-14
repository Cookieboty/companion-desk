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

export interface LicenseConditions {
  commercialUse: boolean;
  redistribution: boolean;
  modification?: boolean;
  credit?: boolean;
  prohibited?: string[];
}

export interface ReviewedLicense {
  name: string;
  url: string;
  /** 固定条件；perModelConditions=true 时由每个模型自带（取自 VRM meta） */
  conditions?: LicenseConditions;
  perModelConditions?: boolean;
}

/**
 * 经人工审核的非 OSI 许可：只因「允许商用 + 允许再分发」而放行。
 * 与 assets-licenses.json 的 reviewedLicenses 保持一致（单测校验）。
 */
export const REVIEWED_MODEL_LICENSES: Readonly<Record<string, ReviewedLicense>> = {
  'LicenseRef-VRoid-AvatarSample': {
    name: 'VRoid AvatarSample terms (pixiv)',
    url: 'https://vroid.pixiv.help/hc/ja/articles/4402394424089',
    conditions: {
      commercialUse: true,
      redistribution: true,
      modification: true,
      credit: false,
      prohibited: ['hate speech / discrimination', 'antisocial or illegal use'],
    },
  },
  'LicenseRef-VRM-Public-1.0': {
    name: 'VRM Public License 1.0',
    url: 'https://vrm.dev/licenses/1.0/',
    perModelConditions: true,
  },
};

export function isAllowedLicense(spdx: unknown): spdx is string {
  return (
    typeof spdx === 'string' &&
    (ALLOWED_MODEL_LICENSES.includes(spdx) ||
      Object.prototype.hasOwnProperty.call(REVIEWED_MODEL_LICENSES, spdx))
  );
}

export function isReviewedLicense(spdx: string): boolean {
  return Object.prototype.hasOwnProperty.call(REVIEWED_MODEL_LICENSES, spdx);
}
