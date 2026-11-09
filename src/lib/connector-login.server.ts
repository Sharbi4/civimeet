import "@tanstack/react-start/server-only";
import type { SteelPage } from "./steel.server";

// Saved-login playbooks: how the agent signs in with a stored login inside its own browser.
// Platforms change their sign-in pages, so every step fails closed: if a field is missing
// or a security check appears, the account is handed to the person in the live browser.
export type LoginSecret = { identifier: string; password: string; handle?: string };
type Step =
  | { waitFor: string; timeoutMs?: number }
  | { fill: keyof LoginSecret; into: string }
  | { submit: string }
  | { ifPresent: string; timeoutMs?: number; then: Step[] };
export type LoginPlaybook = {
  steps: Step[];
  /** Address patterns for verification, two-factor and "is this you?" pages. */
  challengeUrl: RegExp;
  /** Elements that only appear on those checks. */
  challengeSelectors?: string;
  /** Address patterns of the sign-in page itself. */
  loginUrl: RegExp;
};

const submit = 'button[type="submit"], input[type="submit"]';
export const loginPlaybooks: Record<string, LoginPlaybook> = {
  facebook: {
    steps: [
      { waitFor: 'input[name="email"]' },
      { fill: "identifier", into: 'input[name="email"]' },
      { fill: "password", into: 'input[name="pass"]' },
      { submit: `button[name="login"], ${submit}` },
    ],
    challengeUrl: /\/(checkpoint|two_step_verification|two_factor|login\/device-based|recover)/i,
    challengeSelectors: 'input[name="approvals_code"], #checkpointSubmitButton',
    loginUrl: /\/login/i,
  },
  instagram: {
    steps: [
      { waitFor: 'input[name="username"]' },
      { fill: "identifier", into: 'input[name="username"]' },
      { fill: "password", into: 'input[name="password"]' },
      { submit },
    ],
    challengeUrl: /\/(challenge|two_factor|accounts\/suspended)/i,
    challengeSelectors: 'input[name="verificationCode"], input[name="security_code"]',
    loginUrl: /\/accounts\/login/i,
  },
  linkedin: {
    steps: [
      { waitFor: "#username" },
      { fill: "identifier", into: "#username" },
      { fill: "password", into: "#password" },
      { submit },
    ],
    challengeUrl: /\/(checkpoint\/challenge|checkpoint\/pin|add-phone|verification)/i,
    challengeSelectors: 'input[name="pin"]',
    loginUrl: /\/(login|uas\/login|checkpoint\/lg)/i,
  },
  x: {
    steps: [
      { waitFor: 'input[autocomplete="username"]', timeoutMs: 12_000 },
      { fill: "identifier", into: 'input[autocomplete="username"]' },
      { submit: "" },
      {
        waitFor: 'input[name="password"], input[data-testid="ocfEnterTextTextInput"]',
        timeoutMs: 10_000,
      },
      {
        ifPresent: 'input[data-testid="ocfEnterTextTextInput"]',
        timeoutMs: 1_000,
        then: [
          { fill: "handle", into: 'input[data-testid="ocfEnterTextTextInput"]' },
          { submit: "" },
          { waitFor: 'input[name="password"]', timeoutMs: 10_000 },
        ],
      },
      { fill: "password", into: 'input[name="password"]' },
      { submit: "" },
    ],
    challengeUrl: /\/account\/access|login_challenge/i,
    challengeSelectors:
      'input[data-testid="ocfEnterTextTextInput"], input[name="text"][inputmode="numeric"]',
    loginUrl: /\/(i\/flow\/login|login)/i,
  },
  nextdoor: {
    steps: [
      { waitFor: 'input[type="email"], input[name="email"], #id_email' },
      { fill: "identifier", into: 'input[type="email"], input[name="email"], #id_email' },
      { fill: "password", into: 'input[type="password"]' },
      { submit },
    ],
    challengeUrl: /\/(verify|challenge|two_factor)/i,
    loginUrl: /\/login/i,
  },
  reddit: {
    steps: [
      { waitFor: 'input[name="username"]' },
      { fill: "identifier", into: 'input[name="username"]' },
      { fill: "password", into: 'input[name="password"]' },
      { submit: "" },
    ],
    challengeUrl: /\/(two-factor|verify)/i,
    challengeSelectors: 'input[name="appOtp"], input[name="otp"]',
    loginUrl: /\/login/i,
  },
  eventbrite: {
    steps: [
      { waitFor: 'input[type="email"], input[name="email"]' },
      { fill: "identifier", into: 'input[type="email"], input[name="email"]' },
      { submit: "" },
      { waitFor: 'input[type="password"]', timeoutMs: 8_000 },
      { fill: "password", into: 'input[type="password"]' },
      { submit: "" },
    ],
    challengeUrl: /\/(verify|signin\/code|checkpoint)/i,
    loginUrl: /\/signin/i,
  },
  meetup: {
    steps: [
      { waitFor: '#email, input[name="email"]' },
      { fill: "identifier", into: '#email, input[name="email"]' },
      { fill: "password", into: '#current-password, input[type="password"]' },
      { submit },
    ],
    challengeUrl: /\/(verify|captcha|challenge)/i,
    loginUrl: /\/login/i,
  },
};

export type SignInOutcome =
  | { kind: "signed_in"; url: string }
  | { kind: "challenge"; url: string }
  | { kind: "still_signing_in"; url: string }
  | { kind: "page_changed"; message: string };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function classifySignIn(
  page: SteelPage,
  playbook: Pick<LoginPlaybook, "challengeUrl" | "challengeSelectors" | "loginUrl">,
): Promise<SignInOutcome> {
  const state = await page.signInState(playbook.challengeSelectors);
  const path = (() => {
    try {
      const url = new URL(state.url);
      return url.pathname + url.search;
    } catch {
      return state.url;
    }
  })();
  if (playbook.challengeUrl.test(path) || state.challenge)
    return { kind: "challenge", url: state.url };
  if (state.passwordField || playbook.loginUrl.test(path) || state.url === "about:blank")
    return { kind: "still_signing_in", url: state.url };
  return { kind: "signed_in", url: state.url };
}

async function run(
  page: SteelPage,
  steps: Step[],
  secret: LoginSecret,
): Promise<SignInOutcome | null> {
  for (const step of steps) {
    if ("waitFor" in step) {
      if (!(await page.waitFor(step.waitFor, step.timeoutMs)))
        return {
          kind: "page_changed",
          message:
            "The sign-in page looked different than expected. Finish signing in from the live browser.",
        };
    } else if ("fill" in step) {
      const value = secret[step.fill];
      if (!value) return { kind: "challenge", url: "" };
      if (!(await page.fill(step.into, value)))
        return {
          kind: "page_changed",
          message: "A sign-in field was missing. Finish signing in from the live browser.",
        };
      await pause(250 + Math.round(Math.random() * 350));
    } else if ("submit" in step) {
      if (!step.submit || !(await page.click(step.submit))) await page.pressEnter();
      await pause(1_200);
    } else if (await page.waitFor(step.ifPresent, step.timeoutMs ?? 1_000)) {
      const nested = await run(page, step.then, secret);
      if (nested) return nested;
    }
  }
  return null;
}

/** Sign in with a saved login. Never logs, returns or screenshots the login itself. */
export async function signInWithSavedLogin(
  page: SteelPage,
  loginUrl: string,
  playbook: LoginPlaybook,
  secret: LoginSecret,
): Promise<SignInOutcome> {
  try {
    await page.navigate(loginUrl);
  } catch {
    // Heavy social pages can outlast the load check; the field waits below decide.
  }
  // An existing browser profile may already be signed in.
  const already = await classifySignIn(page, playbook);
  if (already.kind === "signed_in" || already.kind === "challenge") return already;
  const stopped = await run(page, playbook.steps, secret);
  if (stopped) return stopped;
  // Give the platform a moment to redirect after the final submit.
  let outcome = await classifySignIn(page, playbook);
  for (let attempt = 0; attempt < 8 && outcome.kind === "still_signing_in"; attempt++) {
    await pause(1_000);
    outcome = await classifySignIn(page, playbook);
  }
  return outcome;
}
