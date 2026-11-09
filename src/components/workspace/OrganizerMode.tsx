import { useState, type ComponentProps } from "react";
import { isPlatformThread } from "@/lib/organizer";
import { OrganizerChat } from "./OrganizerChat";
import { ManagedOrganizer } from "./ManagedOrganizer";

/** Preserve the established browser/event workflow while rolling out managed sessions. */
export function OrganizerMode(props: ComponentProps<typeof OrganizerChat>) {
  const [managed, setManaged] = useState(true);
  if (props.thread === "discover" || isPlatformThread(props.thread)) return <OrganizerChat {...props} />;
  return <div className="min-w-0">
    <div className="flex flex-wrap gap-2 border-b px-4 py-2" aria-label="Organizer mode">
      <button className="ow-button" aria-pressed={managed} onClick={() => setManaged(true)}>Civi · OpenAI organizer</button>
      <button className="ow-button" aria-pressed={!managed} onClick={() => setManaged(false)}>Event tools & previous chat</button>
    </div>
    {managed ? <ManagedOrganizer thread={props.thread} initialMessage={props.initialMessage ?? ""} {...(props.onDraft ? { onDraft: props.onDraft } : {})} /> : <OrganizerChat {...props} />}
  </div>;
}
