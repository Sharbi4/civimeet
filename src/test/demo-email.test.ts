import { describe, expect, it } from "vitest";
import { render } from "@react-email/render";
import { createElement } from "react";
import { TEMPLATES } from "@/lib/email-templates/registry";

describe("demo request email", () => {
  it("fixes the recipient to the owner's support address", () => {
    expect(TEMPLATES["demo-request-notification"]?.to).toBe("support@civimeet.com");
  });
  it("renders safely with missing details and escapes visitor inputs", async () => {
    const template = TEMPLATES["demo-request-notification"];
    if (!template) throw new Error("Demo template missing");
    await expect(render(createElement(template.component, {}))).resolves.toContain("New demo request");
    const html = await render(createElement(template.component, { name: '<script>alert("unsafe")</script>' }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});