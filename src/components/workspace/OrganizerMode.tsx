import { type ComponentProps, type ReactNode } from "react";
import { OrganizerChat } from "./OrganizerChat";
import { ManagedOrganizer } from "./ManagedOrganizer";

/** Every workspace conversation uses the managed OpenAI organizer. */
export function OrganizerMode({
  report,
  ...props
}: ComponentProps<typeof OrganizerChat> & { report?: ReactNode }) {
  return (
    <ManagedOrganizer
      thread={props.thread}
      initialMessage={props.initialMessage ?? ""}
      report={props.thread === "main" ? report : undefined}
      {...(props.onDraft ? { onDraft: props.onDraft } : {})}
    />
  );
}
