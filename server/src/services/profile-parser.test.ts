import test from "node:test";
import assert from "node:assert/strict";
import { parseProfileText } from "./profile-parser.js";

test("parseProfileText derives first and last name from full name when split fields are missing", () => {
  const result = parseProfileText(
    "",
    `
Personal Info:
Full Name: Perry Jones

Contact Info:
Email: perry@example.com
Phone: 555-111-2222
`,
  );

  assert.equal(result.canonicalProfile.personalInfo.fullName, "Perry Jones");
  assert.equal(result.canonicalProfile.personalInfo.firstName, "Perry");
  assert.equal(result.canonicalProfile.personalInfo.lastName, "Jones");
  assert.equal(result.validation.isValid, true);
});
