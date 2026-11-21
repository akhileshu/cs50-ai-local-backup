export type ActionFeedbackKind = 'success' | 'error';

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

const SUCCESS_CLASS = 'action-success';
const ERROR_CLASS = 'action-error';

export function flashActionFeedback(
  targets: HTMLElement | HTMLElement[],
  kind: ActionFeedbackKind,
  ms = 5000,
): void {
  const list = Array.isArray(targets) ? targets : [targets];
  for (const el of list) {
    const prev = timers.get(el);
    if (prev) clearTimeout(prev);
    el.classList.remove(SUCCESS_CLASS, ERROR_CLASS);
    el.classList.add(kind === 'success' ? SUCCESS_CLASS : ERROR_CLASS);
    const t = setTimeout(() => {
      el.classList.remove(SUCCESS_CLASS, ERROR_CLASS);
      timers.delete(el);
    }, ms);
    timers.set(el, t);
  }
}

export function isSuccessStatus(state: string): boolean {
  return state === 'synced' || state === 'nothing_new' || state === 'ready';
}