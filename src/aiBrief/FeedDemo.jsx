// LOCALHOST-ONLY harness for the investor Today feed (TodayScreen) — renders it directly with
// no auth so the ranking/blend of RSS news + company posts can be verified in the browser.
import React from "react";
import { TodayScreen } from "./PassportProto.jsx";

export default function FeedDemo() {
  return (
    <div style={{ height: "100dvh", display: "grid", placeItems: "center", background: "#eef2f7" }}>
      <div style={{ width: 393, height: 852, maxHeight: "94vh", background: "#fff", borderRadius: 40, overflow: "hidden", border: "1px solid #e9eef5", boxShadow: "0 40px 90px -30px rgba(15,23,42,0.4)" }}>
        <TodayScreen onOpenCompany={() => {}} onScan={() => {}} />
      </div>
    </div>
  );
}
