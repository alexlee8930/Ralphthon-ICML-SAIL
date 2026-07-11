import { isTauri } from "@/lib/platform";

/**
 * Remote compute over SSH — connect any machine you can SSH to (CPU or GPU;
 * Slurm optional). Connecting, probing, and driving hosts is a desktop-only
 * capability (it uses your local SSH keys), so on the web this renders the same
 * card shell with its unavailable state.
 */
export function RemoteComputeCard() {
  return (
    <section className="mt-5 rounded-card border border-border bg-surface shadow-card">
      <header className="border-b border-border px-5 py-3">
        <h2 className="font-serif text-[15px] text-text">Remote compute</h2>
        <p className="mt-0.5 text-xs text-muted">
          Run jobs on your own servers over SSH — CPU or GPU; Slurm optional. Uses your own SSH keys; nothing is
          installed on the machine.
        </p>
      </header>
      <div className="px-5 py-4">
        {!isTauri ? (
          <p className="text-[13px] text-muted">Available in the desktop app.</p>
        ) : null}
      </div>
    </section>
  );
}
