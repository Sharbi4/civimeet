import { createServerFn } from "@tanstack/react-start";
import { demoRequestSchema } from "./demo-request";

export const submitDemoRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => demoRequestSchema.parse(input))
  .handler(async ({ data }) => {
    const { saveDemoRequest } = await import("./demo-request.server");
    return saveDemoRequest(data);
  });