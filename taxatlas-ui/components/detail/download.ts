/* Authenticated downloads: /export/* requires the session token, so a plain <a href> cannot be used. */
import { getCurrentAuthToken } from "@/lib/firebase";
import { API_BASE, ApiError } from "@/taxatlas-ui/lib/api";

export async function downloadAuthenticated(path: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = await getCurrentAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    let raw: unknown = null;
    try {
      raw = await res.json();
    } catch {
      raw = await res.text().catch(() => null);
    }
    throw new ApiError(res.status, raw, undefined, { path });
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
