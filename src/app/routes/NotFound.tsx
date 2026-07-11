import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
        <div className="text-lg text-text">404 — Not found</div>
        <div className="text-sm text-muted">This page does not exist.</div>
      </div>
      <Link to="/" className="text-sm text-link underline underline-offset-2">
        Back to workspace
      </Link>
    </div>
  );
}
