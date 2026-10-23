import { describe, expect, it } from "vitest";
import {
  teamRoleAtLeast,
  teamRoleSchema,
  teamRoles,
} from "../src/team-role.js";

describe("TeamRole", () => {
  it("accepts exactly the three role strings", () => {
    expect(teamRoles).toEqual(["owner", "admin", "member"]);
    for (const role of teamRoles) expect(teamRoleSchema.parse(role)).toBe(role);
    for (const role of ["", "Owner", "guest", "administrator"])
      expect(teamRoleSchema.safeParse(role).success).toBe(false);
  });

  it("orders every role pair by the independent rank table", () => {
    const cases = [
      ["owner", "owner", true],
      ["owner", "admin", true],
      ["owner", "member", true],
      ["admin", "owner", false],
      ["admin", "admin", true],
      ["admin", "member", true],
      ["member", "owner", false],
      ["member", "admin", false],
      ["member", "member", true],
    ] as const;
    for (const [role, minimum, expected] of cases)
      expect(teamRoleAtLeast(role, minimum)).toBe(expected);
  });
});
