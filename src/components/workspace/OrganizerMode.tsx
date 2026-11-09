import { type ComponentProps } from "react";
import { isPlatformThread } from "@/lib/organizer";
import { OrganizerChat } from "./OrganizerChat";
import { ManagedOrganizer } from "./ManagedOrganizer";

/** Preserve the established browser/event workflow while rolling out managed sessions. */
export function OrganizerMode(props: ComponentProps<typeof OrganizerChat>) {
  if (props.thread === "discover" || isPlatformThread(props.thread))
    return <OrganizerChat {...props} />;
  return (
    <ManagedOrganizer
      thread={props.thread}
      initialMessage={props.initialMessage ?? ""}
      {...(props.onDraft ? { onDraft: props.onDraft } : {})}
    />
  );
}
