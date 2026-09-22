import { createPrismaClient } from "@interviewed/database";

const db = createPrismaClient();

const DEFAULTS: Record<string, string> = {
  upgradeUrl: process.env.UPGRADE_URL || "",
  defaultTrialLimit: process.env.DEFAULT_TRIAL_LIMIT || "5",
};

export type PlatformSettings = {
  upgradeUrl: string;
  defaultTrialLimit: number;
};

export async function getPlatformSetting(key: keyof typeof DEFAULTS): Promise<string> {
  try {
    const row = await db.platformSetting.findUnique({ where: { key } });
    if (row && row.value.trim()) return row.value;
  } catch {
    // fall through to defaults
  }
  return DEFAULTS[key] ?? "";
}

export async function getAllPlatformSettings(): Promise<PlatformSettings> {
  const [upgradeUrl, defaultTrialLimit] = await Promise.all([
    getPlatformSetting("upgradeUrl"),
    getPlatformSetting("defaultTrialLimit"),
  ]);
  return {
    upgradeUrl,
    defaultTrialLimit: Math.max(0, Number(defaultTrialLimit) || 5),
  };
}

export async function setPlatformSetting(key: keyof typeof DEFAULTS, value: string): Promise<void> {
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export type OrgUsage = {
  plan: string;
  used: number;
  limit: number;
  remaining: number;
  blocked: boolean;
  upgradeUrl: string;
};

export async function getOrgUsage(organizationId: string): Promise<OrgUsage | null> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true, trialInterviewLimit: true },
  });
  if (!org) return null;

  const used = await db.interview.count({
    where: { organizationId, status: { not: "cancelled" } },
  });
  const isTrial = org.plan !== "unlimited";
  const limit = isTrial ? org.trialInterviewLimit : Number.MAX_SAFE_INTEGER;
  const upgradeUrl = await getPlatformSetting("upgradeUrl");

  return {
    plan: org.plan,
    used,
    limit,
    remaining: isTrial ? Math.max(0, limit - used) : Number.MAX_SAFE_INTEGER,
    blocked: isTrial && used >= limit,
    upgradeUrl,
  };
}
