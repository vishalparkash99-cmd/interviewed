type OrgUser = { id: string; role: string };

type OrgDb = {
  user: {
    findUnique(args: { where: { id: string }; select: { organizationId: true } }): Promise<{ organizationId: string | null } | null>;
  };
};

export async function getOrgId(user: OrgUser, db: OrgDb): Promise<string | null> {
  if (user.role === "super_admin") return null;
  const fullUser = await db.user.findUnique({ where: { id: user.id }, select: { organizationId: true } });
  return fullUser?.organizationId || null;
}