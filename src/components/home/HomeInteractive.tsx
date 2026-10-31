import { useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, Minus, Sparkles } from "lucide-react";
import { audiences, homePlatforms, statusLabel, stewardTasks } from "./home-data";

/** Arrow / Home / End keys move between a group of pressed-state buttons. */
function useRovingKeys(count: number, setIndex: (i: number) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const map: Record<string, number> = {
      ArrowRight: (i + 1) % count,
      ArrowDown: (i + 1) % count,
      ArrowLeft: (i - 1 + count) % count,
      ArrowUp: (i - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    if (!(e.key in map)) return;
    e.preventDefault();
    setIndex(map[e.key]!);
    refs.current[map[e.key]!]?.focus();
  };
  return { refs, onKeyDown };
}

export function StewardMiniDemo() {
  const [index, setIndex] = useState(0);
  const { refs, onKeyDown } = useRovingKeys(stewardTasks.length, setIndex);
  const task = stewardTasks[index] ?? stewardTasks[0]!;
  return (
    <div className="cmh-demo">
      <div className="cmh-demo-tasks" role="group" aria-label="Steward tasks">
        {stewardTasks.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            aria-pressed={i === index}
            tabIndex={i === index ? 0 : -1}
            onClick={() => setIndex(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="cmh-task"
          >
            <span className="cmh-task-dot" aria-hidden="true" />
            {t.label}
          </button>
        ))}
        <Link className="cm-text-link cmh-demo-more" to="/product" hash="interactive-demo">
          See the full six-scene demo <ArrowRight size={16} />
        </Link>
      </div>
      <div className="cmh-panel" aria-live="polite">
        <div className="cmh-panel-bar">
          <span className="cmh-badge">Illustrative demo · no live actions</span>
          <span className="cmh-status">
            <Sparkles size={14} aria-hidden="true" /> {task.status}
          </span>
        </div>
        <div key={task.id} className="cmh-panel-body">
          <h3>{task.title}</h3>
          <dl>
            {task.lines.map((l) => (
              <div key={l.k}>
                <dt>{l.k}</dt>
                <dd>{l.v}</dd>
              </div>
            ))}
          </dl>
          <p className="cmh-panel-foot">{task.footer}</p>
        </div>
        <div className="cmh-progress" aria-hidden="true">
          {stewardTasks.map((t, i) => (
            <span key={t.id} data-on={i <= index} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function PlatformExplorer() {
  const [index, setIndex] = useState(0);
  const { refs, onKeyDown } = useRovingKeys(homePlatforms.length, setIndex);
  const p = homePlatforms[index] ?? homePlatforms[0]!;
  return (
    <div className="cmh-explorer">
      <div className="cmh-orbit">
        <div className="cmh-core" aria-hidden="true">
          <span>Steward</span>
        </div>
        <div className="cmh-nodes" role="group" aria-label="Platforms">
          {homePlatforms.map((pl, i) => (
            <button
              key={pl.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              aria-pressed={i === index}
              tabIndex={i === index ? 0 : -1}
              onClick={() => setIndex(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="cmh-node"
              data-status={pl.status}
              style={{ "--i": i, "--n": homePlatforms.length } as React.CSSProperties}
            >
              <span className="cmh-node-mark" aria-hidden="true">
                {pl.short}
              </span>
              <span className="cmh-node-name">{pl.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="cmh-platform-card" aria-live="polite">
        <span className="cmh-pill" data-status={p.status}>
          {statusLabel[p.status]}
        </span>
        <h3>{p.name}</h3>
        <p className="cmh-example">
          <small>Example task</small>
          {p.example}
        </p>
        <div className="cmh-support">
          <ul aria-label="Supported today">
            {p.supported.map((s) => (
              <li key={s}>
                <Check size={15} aria-hidden="true" /> {s}
              </li>
            ))}
          </ul>
          <ul aria-label="Not supported today">
            {p.notSupported.map((s) => (
              <li key={s} className="cmh-no">
                <Minus size={15} aria-hidden="true" /> {s}
              </li>
            ))}
          </ul>
        </div>
        <p className="cmh-access">{p.access}</p>
        <p className="cmh-fine">Selection only — no platform login, connection or calls. No partnership implied.</p>
      </div>
    </div>
  );
}

export function AudienceSelector() {
  const [index, setIndex] = useState(0);
  const { refs, onKeyDown } = useRovingKeys(audiences.length, setIndex);
  const a = audiences[index] ?? audiences[0];
  return (
    <div className="cmh-audience">
      <div className="cmh-audience-tabs" role="group" aria-label="Organization type">
        {audiences.map((x, i) => (
          <button
            key={x.slug}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            aria-pressed={i === index}
            tabIndex={i === index ? 0 : -1}
            onClick={() => setIndex(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {x.name}
          </button>
        ))}
      </div>
      <div key={a.slug} className="cmh-audience-body" aria-live="polite">
        <h3>{a.line}</h3>
        <p>{a.text}</p>
        <Link className="cm-text-link" to="/solutions/$slug" params={{ slug: a.slug }}>
          CiviMeet for {a.name.toLowerCase()} <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}
