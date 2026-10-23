import * as z from "zod";

/** The shared vocabulary of roles held by a Team member. */
export const teamRoles = Object.freeze(["owner", "admin", "member"] as const);

/** Schema for role strings received from ordinary serialized data. */
export const teamRoleSchema: z.ZodType<(typeof teamRoles)[number]> = z.lazy(
  () => z.enum(teamRoles),
);

/** A Team role accepted by the shared role grammar. */
export type TeamRole = z.infer<typeof teamRoleSchema>;

const roleRank = {
  owner: 2,
  admin: 1,
  member: 0,
} satisfies Record<TeamRole, number>;

/** Whether `role` meets or exceeds a minimum role rank. */
export function teamRoleAtLeast(role: TeamRole, minimum: TeamRole): boolean {
  return roleRank[role] >= roleRank[minimum];
}
