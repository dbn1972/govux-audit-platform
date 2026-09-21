"use client";
// Central icon layer for the UX4G migration.
//
// The app previously used bootstrap-icons via `<i className="bi bi-x" />`, with
// some icon identities passed around as STRINGS through data (the nav model in
// AppShell, the notification-kind map in NotificationBell). Rather than rewrite
// every call site to import a specific lucide component — and lose the ability
// to name an icon in data — this module maps our icon vocabulary (the old
// bi-* names) onto lucide-react components behind one <Icon name="..."> API.
//
// Decorative by default (aria-hidden). Pass `title` for a meaningful icon and
// it becomes a labelled <svg role="img">, so the axe WCAG 2.2 AA gate stays green.
// lucide-react 1.x uses shape-first names (CircleAlert, TriangleAlert, …) and
// dropped brand icons (Chrome). We import the current names and alias them to
// the vocabulary the map below expects, so the mapping table reads by intent.
import {
  Activity, ArrowDown, ArrowUp, ArrowLeft, ArrowRight, RefreshCw, CornerDownRight,
  Landmark, Bell, Book, LogOut, ExternalLink, AppWindow as Chrome,
  Building as Building2, CircleCheckBig as CheckCircle2, Check,
  SquareCheck as CheckSquare, ClipboardCheck, RotateCcw as History, Layers,
  Minus, Network, Workflow, Dot, Download, CircleAlert as AlertCircle,
  OctagonAlert, TriangleAlert as AlertTriangle, FileDown, FileText,
  FileArchive, Settings, Settings2, Globe, TrendingDown, LayoutGrid,
  Hourglass, Inbox, Info, Key, Menu, Lock, WandSparkles as Wand2,
  Map as MapIcon, Moon, BadgeCheck, Phone, CirclePlay as PlayCircle, Play,
  CirclePlus as PlusCircle, Plus, Search, Send, ShieldCheck, ShieldAlert,
  Shield, SlidersHorizontal, Gauge, Sparkles, Sun, Trash as Trash2, Trophy,
  Accessibility, Upload, X,
  type LucideIcon,
} from "lucide-react";

// Our icon vocabulary → lucide component. Keys are the historical bi-* names
// (without the "bi-" prefix) so existing data strings map straight through.
// Bootstrap's filled / -lg / numbered variants collapse to lucide's single style.
const ICONS: Record<string, LucideIcon> = {
  "activity": Activity,
  "arrow-down": ArrowDown,
  "arrow-up": ArrowUp,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-repeat": RefreshCw,
  "arrow-return-right": CornerDownRight,
  "bank": Landmark,
  "bell": Bell,
  "book": Book,
  "box-arrow-right": LogOut,
  "box-arrow-up-right": ExternalLink,
  "browser-chrome": Chrome,
  "building": Building2,
  "check-circle": CheckCircle2,
  "check-circle-fill": CheckCircle2,
  "check2-circle": CheckCircle2,
  "check-lg": Check,
  "check2": Check,
  "check2-square": CheckSquare,
  "clipboard-check": ClipboardCheck,
  "clock-history": History,
  "collection": Layers,
  "dash": Minus,
  "diagram-2": Network,
  "diagram-3": Workflow,
  "dot": Dot,
  "download": Download,
  "exclamation-circle": AlertCircle,
  "exclamation-octagon": OctagonAlert,
  "exclamation-triangle": AlertTriangle,
  "file-earmark-arrow-down": FileDown,
  "file-earmark-text": FileText,
  "file-text": FileText,
  "file-earmark-zip": FileArchive,
  "gear": Settings,
  "gear-wide-connected": Settings2,
  "globe": Globe,
  "globe2": Globe,
  "graph-down-arrow": TrendingDown,
  "grid": LayoutGrid,
  "hourglass-split": Hourglass,
  "inbox": Inbox,
  "info-circle": Info,
  "key": Key,
  "list": Menu,
  "lock": Lock,
  "magic": Wand2,
  "map": MapIcon,
  "moon-stars": Moon,
  "patch-check": BadgeCheck,
  "phone": Phone,
  "play-circle": PlayCircle,
  "play-fill": Play,
  "plus-circle": PlusCircle,
  "plus-lg": Plus,
  "search": Search,
  "send": Send,
  "shield-check": ShieldCheck,
  "shield-exclamation": ShieldAlert,
  "shield-fill-exclamation": ShieldAlert,
  "shield-lock": Shield,
  "sliders": SlidersHorizontal,
  "speedometer2": Gauge,
  "stars": Sparkles,
  "sun": Sun,
  "trash": Trash2,
  "trophy": Trophy,
  "universal-access-circle": Accessibility,
  "upload": Upload,
  "x-lg": X,
};

/** Normalise a name to a map key: accept "bi-grid", "grid", or "bi grid". */
function keyOf(name: string): string {
  return name.trim().replace(/^bi\s+/, "").replace(/^bi-/, "");
}

export type IconProps = {
  /** Icon name — the bi-* name with or without the "bi-" prefix (e.g. "grid" or "bi-grid"). */
  name: string;
  /** Pixel size (width & height). Default 16, matching the old inline icon sizing. */
  size?: number;
  /** Accessible label. When set the icon is exposed to AT; otherwise it is decorative. */
  title?: string;
  className?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
};

/** Single icon component backed by lucide-react. */
export default function Icon({ name, size = 16, title, className, strokeWidth, style }: IconProps) {
  const Cmp = ICONS[keyOf(name)];
  if (!Cmp) {
    // Loud in dev, invisible in prod — a missing glyph should be caught, not shipped as a gap.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[Icon] no lucide mapping for "${name}"`);
    }
    return null;
  }
  return (
    <Cmp
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      style={style}
      // Decorative unless titled: mirrors the old aria-hidden intent.
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
    />
  );
}

/** True when `name` has a lucide mapping — lets callers guard optional icons. */
export function hasIcon(name: string): boolean {
  return keyOf(name) in ICONS;
}
