import { useEffect, useRef } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import {
  FileSearch,
  Moon,
  NotebookPen,
  PackagePlus,
  Plus,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useUiStore } from "@/lib/store";

interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  run: () => void;
}

/** Starter prompts seeded into the live composer, so ⌘K and the empty-session
 *  cards stay in sync. */
const STARTER_PROMPTS: Record<string, string> = {
  analyze: "Analyze my data and propose a first set of figures with a short writeup.",
  audit: "Audit this report for citation, number, and figure traceability.",
};
const starterPrompt = (id: string) => STARTER_PROMPTS[id] ?? "";

export function CommandPalette() {
  const { paletteOpen: open, setPaletteOpen: setOpen, toggleTheme, setComposerDraft } = useUiStore();
  const navigate = useNavigate();

  // Keep the current open state readable inside the once-mounted key listener
  // without re-subscribing on every toggle.
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(!openRef.current);
      }
      // Consume Esc only when the palette is open — a marked-handled Esc must
      // not also interrupt a running agent turn (the live page listens too).
      if (e.key === "Escape" && openRef.current) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  const close = () => setOpen(false);

  // Start a new session seeded with a workflow prompt, then reveal the live page.
  const runWorkflow = (starterId: string) => {
    close();
    setComposerDraft(starterPrompt(starterId));
    navigate("/live");
  };

  const actions: Action[] = [
    { id: "new", label: "New session", icon: <Plus size={16} />, run: () => { navigate("/live"); close(); } },
    { id: "analyze", label: "Analyze my data (new workflow)", icon: <FileSearch size={16} />, run: () => runWorkflow("analyze") },
    { id: "review", label: "Audit a report (traceability review)", icon: <ShieldCheck size={16} />, run: () => runWorkflow("audit") },
    { id: "notebooks", label: "Open notebooks", icon: <NotebookPen size={16} />, run: () => { navigate("/notebooks"); close(); } },
    { id: "skills", label: "Manage skills", icon: <PackagePlus size={16} />, run: () => { navigate("/skills"); close(); } },
    { id: "settings", label: "Open settings", icon: <Settings size={16} />, run: () => { navigate("/settings"); close(); } },
    { id: "theme", label: "Toggle light / dark theme", icon: <Moon size={16} />, run: () => { toggleTheme(); close(); } },
  ];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-[16vh]"
      onClick={close}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg">
        <Command
          label="Command palette"
          className="overflow-hidden rounded-card border border-border bg-surface shadow-pop"
        >
          <Command.Input
            autoFocus
            placeholder="Type a command…"
            className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-text outline-none placeholder:text-muted"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
              No results.
            </Command.Empty>
            {actions.map((a) => (
              <Command.Item
                key={a.id}
                value={a.label}
                onSelect={a.run}
                className="flex cursor-pointer items-center gap-3 rounded-input px-3 py-2 text-sm text-text data-[selected=true]:bg-surface-2"
              >
                <span className="text-muted">{a.icon}</span>
                {a.label}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
