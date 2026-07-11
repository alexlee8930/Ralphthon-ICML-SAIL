import { isTauri } from "@/lib/platform";

/**
 * Cloud compute (Modal) status. The app never handles credentials — Modal runs
 * use the user's own install + token, and only the desktop app can detect that.
 * On the web this renders the same card shell with its unavailable state.
 */
export function ModalCard() {
  return (
    <section className="mt-5 rounded-card border border-border bg-surface shadow-card">
      <header className="flex items-center gap-2 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[15px] text-text">Cloud compute (Modal)</h2>
          <p className="mt-0.5 text-xs text-muted">Run GPU / elastic jobs on Modal with your own account — then just ask the agent.</p>
        </div>
      </header>
      <div className="px-5 py-4 text-[13px]">
        {!isTauri ? (
          <p className="text-muted">Available in the desktop app.</p>
        ) : null}
      </div>
    </section>
  );
}
