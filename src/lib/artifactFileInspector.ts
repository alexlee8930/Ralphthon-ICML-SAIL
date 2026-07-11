// Private inspector-area web adaptation of the reference `lib/artifactFile`
// (MIT). The desktop app resolved workspace files through Tauri commands and a
// local file server; on the web those surfaces don't exist, so each call
// degrades exactly the way the reference already degraded in browser dev:
// return null / no-op, letting inline `content` (when a tool carried it) or a
// real URL drive the preview instead.
import { openExternal } from "@/lib/platform";
import type { FileRoot } from "@/lib/artifacts";

export type { FileRoot };

export interface ArtifactFile {
  path: string;
  mime: string;
  /** "utf8" for text, "base64" for binary. */
  encoding: "utf8" | "base64";
  data: string;
  size: number;
}

/** Read a root-relative file. Always null on the web (no workspace filesystem). */
export async function readArtifact(_path: string, _root?: FileRoot): Promise<ArtifactFile | null> {
  return null;
}

/** URL a file is previewable at. On the web only an already-URL path (http(s)/
 *  data/blob or an absolute same-origin path) qualifies; workspace-relative
 *  paths have no local file server to serve them. */
export async function previewUrl(path: string, _root?: FileRoot): Promise<string | null> {
  if (/^(https?:|data:|blob:)/i.test(path) || path.startsWith("/")) return path;
  return null;
}

/** Open a file in a new tab when it resolves to a URL; no-op otherwise. */
export async function openArtifactExternally(path: string, root?: FileRoot): Promise<void> {
  const url = await previewUrl(path, root);
  if (url) openExternal(url);
}

/** Introspect a file too big to preview WITHOUT loading it. The probe binary
 *  is desktop-only; the web build returns null (the panel simply shows nothing). */
export async function probeLargeFile(
  _path: string,
  _root?: FileRoot,
): Promise<LargeFilePointer | null> {
  return null;
}

/** The probe's JSON pointer. Fields vary by format; these are the common ones
 *  the panel renders (all optional — unknown formats still show size + note). */
export interface LargeFilePointer {
  format?: string;
  size?: string;
  size_bytes?: number;
  note?: string;
  error?: string;
  hint?: string;
  // tables
  columns?: { name: string; dtype: string }[];
  n_columns?: number;
  approx_rows?: number;
  sample_head?: string[][];
  // genomics
  approx_reads?: number;
  approx_sequences?: number;
  approx_variants?: number;
  read_length?: { min: number; max: number; mean: number };
  samples?: string[];
  sample_ids?: string[];
  gzipped?: boolean;
  // hdf5 / fits / netcdf / parquet
  datasets?: { path: string; shape: number[]; dtype: string }[];
  num_rows?: number;
  [k: string]: unknown;
}

/** Build a `data:` URL from a read artifact for <img>/<iframe>/native viewers. */
export function toDataUrl(f: ArtifactFile): string {
  if (f.encoding === "base64") return `data:${f.mime};base64,${f.data}`;
  return `data:${f.mime};charset=utf-8,${encodeURIComponent(f.data)}`;
}

/** Decode a base64 artifact into raw bytes for binary renderers (docx/xlsx/pptx). */
export function base64ToBytes(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
