/** Passwords must be at least 8 characters and both entries must match. */
export function newPasswordProblem(password: string, confirm: string) {
  if (password.length < 8) return "Use at least 8 characters.";
  if (password !== confirm) return "The two passwords don’t match.";
  return null;
}
