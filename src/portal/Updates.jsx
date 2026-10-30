// Updates — messages, notifications and analytics, one destination, three tabs.
//
// WHY THIS EXISTS
// ---------------
// Three sidebar entries all answered the same question: "what happened since I
// was last here?" Separating them meant checking three places to find out.
//
// IT OWNS NO FEATURE LOGIC. Messages, Notifications and Analytics are the
// existing components, unchanged -- same data, same permissions, same analytics
// collection. This file is a tab bar.
//
// Tab state is LIFTED to Portal.jsx so the tab survives a trip to another
// section and back. Defaults to Messages on first visit.
//
// INACTIVE TABS ARE NOT MOUNTED. Each of the three fetches on mount, so
// rendering all three would triple the request count for a page where you only
// read one. The cost is that switching back re-fetches; that is the right
// trade for a panel whose whole purpose is showing what is new.

import React, { Suspense, lazy } from "react";
import { Mail, Bell, BarChart3 } from "lucide-react";

const Messages      = lazy(() => import("./Messages.jsx"));
const Notifications = lazy(() => import("./Notifications.jsx"));
const Analytics     = lazy(() => import("./Analytics.jsx"));

const Loader = () => (
  <div className="grid h-[40vh] place-items-center text-[13px] font-semibold text-slate-400">Loading…</div>
);

const TABS = [
  { id: "messages",      label: "Messages",      Icon: Mail },
  { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "analytics",     label: "Analytics",     Icon: BarChart3 },
];

export default function Updates({
  company,
  tab = "messages",
  setTab,
  msgCount = 0,
  notifCount = 0,
  onNotificationsSeen = () => {},
}) {
  const active = TABS.some((t) => t.id === tab) ? tab : "messages";

  // Per-tab counts only. Analytics deliberately has none -- activity on a chart
  // is not something you have failed to read, and badging it would train people
  // to ignore the badge.
  const countFor = (id) => (id === "messages" ? msgCount : id === "notifications" ? notifCount : 0);

  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Updates</h1>
      <p className="mt-1 text-[14px] text-slate-500">Messages from investors, activity on your profile, and how it is performing.</p>

      <div className="mt-5 flex items-center gap-1 border-b border-slate-100">
        {TABS.map(({ id, label, Icon }) => {
          const on = id === active;
          const n = countFor(id);
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={on ? "page" : undefined}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13.5px] font-bold tracking-tight transition ${
                on ? "border-blue-600 text-blue-600"
                   : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <Icon size={15.5} strokeWidth={on ? 2.4 : 2.2} />
              {label}
              {n > 0 && (
                <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-blue-600 px-1 text-[10.5px] font-bold text-white">
                  {n > 99 ? "99+" : n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        <Suspense fallback={<Loader />}>
          {active === "messages"      && <Messages company={company} />}
          {active === "notifications" && <Notifications company={company} onSeen={onNotificationsSeen} />}
          {active === "analytics"     && <Analytics company={company} />}
        </Suspense>
      </div>
    </div>
  );
}
