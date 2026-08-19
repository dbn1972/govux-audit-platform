"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { relative } from "@/lib/format";

const ICON: Record<string, string> = {
  audit_complete: "bi-clipboard-check",
  regression: "bi-graph-down-arrow",
  approval: "bi-inbox",
};

/** The bell, with something behind it.
 *
 *  It previously linked to /settings — an icon that reads as an inbox opening a
 *  preferences page. It now shows what the notify service records: audits that
 *  finished, scores that regressed, approvals that were decided.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ unread: number; items: any[] } | null>(null);

  async function load() {
    try { setData(await api.notifications()); } catch { setData({ unread: 0, items: [] }); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".gx-menu-wrap")) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [open]);

  const unread = data?.unread || 0;
  const items = data?.items || [];

  async function markAll() {
    await api.markNotificationsRead().catch(() => {});
    load();
  }

  return (
    <div className="gx-menu-wrap">
      <button type="button" className="gx-icon-btn position-relative"
        onClick={() => { setOpen(o => !o); if (!open) load(); }}
        aria-haspopup="menu" aria-expanded={open}
        aria-label={unread ? `Notifications — ${unread} unread` : "Notifications"}>
        <i className="bi bi-bell" aria-hidden="true" />
        {unread > 0 && <span className="gx-badge-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="gx-menu gx-menu-wide" role="menu">
          <div className="gx-menu-head d-flex align-items-center">
            <span className="fw-semibold">Notifications</span>
            {unread > 0 && (
              <button type="button" className="btn btn-link btn-sm ms-auto p-0"
                onClick={markAll}>Mark all read</button>
            )}
          </div>

          {data == null && <div className="gx-muted text-center py-4">Loading…</div>}

          {data != null && items.length === 0 && (
            <div className="gx-muted text-center py-4" style={{ paddingInline: "1rem" }}>
              Nothing yet. Finished audits, score regressions and approval
              decisions appear here.
            </div>
          )}

          {items.map((n) => (
            <Link key={n.id} href={n.link || "/dashboard"} role="menuitem"
              className={`gx-menu-item gx-notif ${n.read ? "" : "gx-notif-unread"}`}
              onClick={() => setOpen(false)}>
              <i className={`bi ${ICON[n.kind] || "bi-dot"}`} aria-hidden="true" />
              <span>
                <span className="d-block fw-semibold">{n.title}</span>
                {n.body && <span className="d-block gx-muted" style={{ fontSize: ".8125rem" }}>{n.body}</span>}
                <span className="d-block gx-muted" style={{ fontSize: ".75rem" }}>{relative(n.created_at)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
