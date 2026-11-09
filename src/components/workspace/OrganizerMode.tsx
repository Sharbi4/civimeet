import { type ComponentProps, type ReactNode } from "react";
import { isPlatformThread } from "@/lib/organizer";
import { OrganizerChat } from "./OrganizerChat";
import { ManagedOrganizer } from "./ManagedOrganizer";

/** Preserve the established browser/event workflow while rolling out managed sessions. */
export function OrganizerMode({
  report,
  ...props
}: ComponentProps<typeof OrganizerChat> & { report?: ReactNode }) {
  if (props.thread === "discover" || isPlatformThread(props.thread))
    return <OrganizerChat {...props} />;
  return (
    <ManagedOrganizer
      thread={props.thread}
      initialMessage={props.initialMessage ?? ""}
      report={props.thread === "main" ? report : undefined}
      {...(props.onDraft ? { onDraft: props.onDraft } : {})}
    />
  );
}
