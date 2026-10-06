// ─────────────────────────────────────────────────────────────────────────────
// MineEx sales page — v2 (redesign). Pass 1: Foundation + Hero + "How MineEx
// Works" journey. The page DEMONSTRATES the product: real Conference Mode runs
// inside the iPad, the investor screens are interactive, and one connected demo
// state carries a Follow / Publish action through to the phone's notification.
// Dev preview at /sitex. Does not touch the existing /site.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useState } from "react";
import { MarketingStyles, MX, EASE, Reveal, useViewport, Phone } from "../system.jsx";
import { PushNotification } from "../ui/AppUI.jsx";
import { CO, RELEASES, IMG } from "../data.js";
import {
  DemoProvider, useDemo, CB, CB_DEEP, CB_SOFT, ConfLive, PhoneDemo, PhoneProfile,
  BoothBackdrop, Figure, QrBridge, QrChip,
} from "./kit.jsx";

const MAXW = 1240;
const Wrap = ({ children, style }) => (
  <div style={{ width: "100%", maxWidth: MAXW, margin: "0 auto", padding: "0 clamp(22px,5vw,64px)", ...style }}>{children}</div>
);
const Eyebrow = ({ children, dark, cobalt }) => (
  <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, monospace", fontSize: 12, fontWeight: 600, letterSpacing: "0.22em", textTransform: "uppercase", color: cobalt ? CB : dark ? MX.onDarkMute : MX.mute, display: "flex", alignItems: "center", gap: 12 }}>
    <span style={{ width: 26, height: 2, background: cobalt ? CB : "currentColor", borderRadius: 2 }} />{children}
  </div>
);

/* ── NAV ──────────────────────────────────────────────────────────────────── */
function Nav() {
  const { mobile } = useViewport();
  return (
    <header style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, background: "rgba(245,246,247,0.82)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${MX.hair}` }}>
      <Wrap style={{ height: 62, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="#top" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", color: MX.ink }}>
          <span style={{ width: 24, height: 24, borderRadius: 7, background: CB, color: "#fff", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800, letterSpacing: "-0.03em" }}>M</span>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.03em" }}>MineEx</span>
        </a>
        {!mobile && (
          <nav style={{ display: "flex", gap: 30, fontSize: 14, fontWeight: 600, color: MX.dim }}>
            <a href="#how" style={{ color: "inherit", textDecoration: "none" }}>How it works</a>
            <a href="#conference" style={{ color: "inherit", textDecoration: "none" }}>Conference Mode</a>
            <a href="#investors" style={{ color: "inherit", textDecoration: "none" }}>For investors</a>
            <a href="#companies" style={{ color: "inherit", textDecoration: "none" }}>For companies</a>
          </nav>
        )}
        <a href="#demo" style={{ height: 40, padding: "0 18px", borderRadius: 999, background: MX.ink, color: "#fff", fontSize: 14, fontWeight: 700, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Book a Demo</a>
      </Wrap>
    </header>
  );
}

/* ── HERO — editorial · cinematic · institutional. Real project photography as the
   environment; the live product framed like a specimen; cobalt as the single signal. */
const INK = "#0a0b0e";
function GridTexture() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: `linear-gradient(rgba(147,180,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(147,180,255,0.05) 1px, transparent 1px)`, backgroundSize: "72px 72px", maskImage: "radial-gradient(120% 90% at 70% 10%, #000 20%, transparent 75%)", WebkitMaskImage: "radial-gradient(120% 90% at 70% 10%, #000 20%, transparent 75%)" }} />
  );
}
function CornerTicks({ inset = 10, len = 16 }) {
  const c = (pos) => {
    const s = { position: "absolute", width: len, height: len, borderColor: CB, borderStyle: "solid", opacity: 0.85 };
    if (pos === "tl") return { ...s, top: inset, left: inset, borderWidth: "1.5px 0 0 1.5px" };
    if (pos === "tr") return { ...s, top: inset, right: inset, borderWidth: "1.5px 1.5px 0 0" };
    if (pos === "bl") return { ...s, bottom: inset, left: inset, borderWidth: "0 0 1.5px 1.5px" };
    return { ...s, bottom: inset, right: inset, borderWidth: "0 1.5px 1.5px 0" };
  };
  return <>{["tl", "tr", "bl", "br"].map((p) => <span key={p} aria-hidden style={c(p)} />)}</>;
}
// The live product mounted like a specimen on a dark stage — a cobalt glow lifts it
// off the ground, registration ticks + a coordinate label read as instrument chrome.
// No competing background photo: the terrain imagery lives inside the product itself.
function DeviceStage({ children, mobile }) {
  return (
    <div style={{ position: "relative" }}>
      {/* soft cobalt bloom behind the device */}
      <div aria-hidden style={{ position: "absolute", inset: "-18% -12% -14% -12%", background: "radial-gradient(60% 60% at 55% 42%, rgba(37,99,235,0.28), transparent 72%)", filter: "blur(6px)" }} />
      {/* registration frame */}
      <div aria-hidden style={{ position: "absolute", inset: mobile ? "-4% 0 -5% 0" : "-6% -7% -8% -7%" }}>
        <CornerTicks inset={0} len={20} />
        {!mobile && <span style={{ position: "absolute", right: 2, top: -20, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: "0.18em", color: "rgba(147,180,255,0.6)" }}>CONFERENCE MODE · LIVE</span>}
        <span style={{ position: "absolute", left: 2, bottom: -20, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: "0.16em", color: "rgba(147,180,255,0.55)" }}>26°34′N · 106°12′W · LAS COLORADAS</span>
      </div>
      <div style={{ position: "relative", zIndex: 2, filter: "drop-shadow(0 60px 90px rgba(0,0,0,0.7))" }}>{children}</div>
    </div>
  );
}
function Hero() {
  const { mobile } = useViewport();
  return (
    <section id="top" style={{ position: "relative", background: INK, color: "#fff", overflow: "hidden", paddingTop: mobile ? 108 : 124, paddingBottom: mobile ? 56 : 80, minHeight: mobile ? "auto" : "94vh", display: "flex", alignItems: "center" }}>
      <GridTexture />
      <Wrap style={{ position: "relative", zIndex: 3, width: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1.02fr 1.08fr", gap: mobile ? 52 : 54, alignItems: "center" }}>
          <Reveal>
            <div>
              <Eyebrow dark cobalt>Investor platform · junior mining</Eyebrow>
              <h1 style={{ margin: "26px 0 0", fontWeight: 800, fontSize: "clamp(40px,5.6vw,78px)", lineHeight: 0.97, letterSpacing: "-0.045em", textWrap: "balance" }}>
                The investor<br />relationship <span style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontWeight: 400, fontStyle: "italic", letterSpacing: "0em", fontSize: "1.04em" }}>doesn't&nbsp;end</span><br />at the booth.
              </h1>
              <p style={{ fontSize: "clamp(16px,1.55vw,20px)", lineHeight: 1.55, color: "rgba(255,255,255,0.64)", marginTop: 26, maxWidth: "40ch" }}>
                A junior company meets an investor for ninety seconds at a conference. MineEx turns that moment into a relationship that keeps going — long after they leave the booth.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 34 }}>
                <a href="#demo" style={ctaSkin("cobalt")}>Book a demo</a>
                <a href="#how" style={ctaSkin("ghost")}>See how it works</a>
              </div>
              <div style={{ marginTop: 38, display: "flex", alignItems: "center", gap: 11, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.42)" }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: CB, boxShadow: `0 0 12px ${CB}` }} />
                Live product below — not a screenshot
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <DeviceStage mobile={mobile}>
              <ConfLive tpl="keynote2" chips={false} />
            </DeviceStage>
          </Reveal>
        </div>
      </Wrap>
    </section>
  );
}
const ctaSkin = (kind) => {
  const base = { height: 54, padding: "0 26px", borderRadius: 999, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 9, transition: `transform .2s ${EASE}` };
  if (kind === "cobalt") return { ...base, background: CB, color: "#fff", boxShadow: "0 20px 44px -18px rgba(37,99,235,0.75)" };
  if (kind === "white") return { ...base, background: "#fff", color: MX.ink };
  return { ...base, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.24)" };
};

/* ── HOW MINEEX WORKS — the signature journey ─────────────────────────────── */
// One system across seven beats. Illustration sets physical context; live/interactive
// product proves what happens. A connected demo state links Follow → Publish → Notify.
function Journey() {
  return (
    <DemoProvider>
      <section id="how" style={{ background: MX.sheet, paddingTop: "clamp(70px,10vh,130px)" }}>
        <Wrap>
          <Reveal>
            <div style={{ textAlign: "center", maxWidth: "24ch", margin: "0 auto" }}>
              <Eyebrow cobalt>How MineEx works</Eyebrow>
              <h2 style={{ fontSize: "clamp(30px,4.4vw,56px)", fontWeight: 800, letterSpacing: "-0.04em", lineHeight: 1.02, margin: "18px auto 0", textWrap: "balance" }}>
                One introduction. Then every update that follows.
              </h2>
            </div>
          </Reveal>
        </Wrap>

        <Beat n="01" kicker="Attract" title="Tell your story differently." lead="Replace the static booth deck with a premium interactive presentation, powered by your company's own verified data. Switch templates — same facts, a different visual system.">
          <ConfLive tpl="keynote2" chips />
          <Caption>Real Conference Mode. One verified dataset — many ways to tell it. MineEx presents disclosed information; it never invents geology, geography or results.</Caption>
        </Beat>

        <Beat n="02" kicker="Connect" title="The conversation doesn't end at the booth." lead="At the end of the presentation, the investor scans one QR — and arrives directly at your company's MineEx profile. No business card. No company name to remember." reverse>
          <ConnectDemo />
        </Beat>

        <Beat n="03" kicker="Follow" title="Turn interest into a connection." lead="They press Follow once. Now they're part of your audience — and you have a direct path back to them. Try it:">
          <FollowDemo />
        </Beat>

        <Beat n="04" kicker="Leave" title="They left the booth. They didn't leave your company." lead="The investor walks away. The connection to your company stays live in their pocket — the point most conference marketing misses." reverse>
          <LeaveIllustration />
        </Beat>

        <Beat n="05" kicker="Publish" title="Publish once. Reach the investors who chose to follow." lead="Later, from the Company Portal, you publish an update. One action, sent to your followers. Press Publish and watch where it goes:">
          <PublishDemo />
        </Beat>

        <Beat n="06" kicker="Return" title="Be there when the next catalyst happens." lead="Assays. Drilling. Studies. Financings. The update reaches the investor wherever they are — and one tap reopens your company. The 90-second meeting is now an ongoing relationship." reverse>
          <ReturnIllustration />
        </Beat>

        <div style={{ height: "clamp(70px,10vh,120px)" }} />
      </section>
    </DemoProvider>
  );
}

function Beat({ n, kicker, title, lead, reverse, children }) {
  const { mobile } = useViewport();
  const text = (
    <Reveal>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, fontWeight: 700, color: CB, letterSpacing: "0.06em" }}>{n}</span>
        <Eyebrow cobalt>{kicker}</Eyebrow>
      </div>
      <h3 style={{ fontSize: "clamp(26px,3.2vw,42px)", fontWeight: 800, letterSpacing: "-0.035em", lineHeight: 1.05, margin: "16px 0 0", textWrap: "balance" }}>{title}</h3>
      <p style={{ fontSize: "clamp(15px,1.55vw,19px)", lineHeight: 1.55, color: MX.dim, marginTop: 16, maxWidth: "42ch" }}>{lead}</p>
    </Reveal>
  );
  const stage = <Reveal delay={0.08}><div>{children}</div></Reveal>;
  return (
    <Wrap style={{ paddingTop: "clamp(48px,8vh,96px)" }}>
      <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "0.92fr 1.08fr", gap: mobile ? 34 : 64, alignItems: "center", direction: reverse && !mobile ? "rtl" : "ltr" }}>
        <div style={{ direction: "ltr" }}>{text}</div>
        <div style={{ direction: "ltr" }}>{stage}</div>
      </div>
    </Wrap>
  );
}
function Caption({ children }) {
  return <p style={{ fontSize: 13, lineHeight: 1.5, color: MX.mute, marginTop: 18, textAlign: "center", maxWidth: "52ch", marginLeft: "auto", marginRight: "auto" }}>{children}</p>;
}

/* Connect — a booth QR bridging to the live company profile. */
function ConnectDemo() {
  const { mobile } = useViewport();
  return (
    <div style={{ position: "relative", display: "grid", gridTemplateColumns: mobile ? "1fr" : "auto 1fr auto", alignItems: "center", gap: 20, background: "#080b14", borderRadius: 22, padding: mobile ? 26 : 40, overflow: "hidden" }}>
      <BoothBackdrop />
      {!mobile && (
        <div style={{ position: "relative", zIndex: 2, textAlign: "center" }}>
          <QrChip size={116} />
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "#93b4ff", marginTop: 12 }}>Booth QR</div>
        </div>
      )}
      {!mobile && <div style={{ position: "relative", zIndex: 2 }}><QrBridge style={{ width: "100%", height: 80 }} /></div>}
      <div style={{ position: "relative", zIndex: 2, display: "flex", justifyContent: mobile ? "center" : "flex-end" }}>
        <DemoProvider><PhoneProfile width={mobile ? "min(64vw,250px)" : "min(22vw,240px)"} /></DemoProvider>
      </div>
    </div>
  );
}

/* Follow — the real Follow button, wired to the connected demo state. */
function FollowDemo() {
  const { following } = useDemo();
  const { mobile } = useViewport();
  return (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr auto", gap: 24, alignItems: "center", background: "#fff", border: `1px solid ${MX.hair}`, borderRadius: 22, padding: mobile ? 22 : 34 }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <PhoneDemo width={mobile ? "min(64vw,250px)" : "min(22vw,250px)"} />
      </div>
      <div style={{ minWidth: mobile ? 0 : 220 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: following ? CB : MX.mute }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: following ? CB : MX.hair, transition: `background .3s ${EASE}` }} />
          {following ? "Following — you're now in the audience" : "Not following yet"}
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: MX.dim, marginTop: 12 }}>
          Press <b style={{ color: MX.ink }}>Follow</b> on the profile. This is the real investor screen — the same one that ships in the app.
        </p>
      </div>
    </div>
  );
}

/* Leave — silhouette walking away from the booth, phone still glowing cobalt. */
function LeaveIllustration() {
  return (
    <div style={{ position: "relative", background: "#080b14", borderRadius: 22, overflow: "hidden", aspectRatio: "4/3" }}>
      <BoothBackdrop />
      <div style={{ position: "absolute", right: "8%", top: "16%", bottom: "10%", width: "34%", opacity: 0.5 }}><Figure variant="dark" style={{ width: "100%", height: "100%" }} /></div>
      <div style={{ position: "absolute", left: "14%", top: "14%", bottom: "8%", width: "40%" }}><Figure variant="dark" phone glow style={{ width: "100%", height: "100%" }} /></div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "40%", background: "linear-gradient(0deg,#080b14,transparent)" }} />
      <div style={{ position: "absolute", left: 26, bottom: 22, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "#93b4ff" }}>
        Off the floor · still connected
      </div>
    </div>
  );
}

/* Publish — the powerful one. A compact portal composer; pressing Publish sets the
   connected state → a notification arrives on the same investor phone. */
function PublishDemo() {
  const { mobile } = useViewport();
  const { published, setPublished } = useDemo();
  const rel = RELEASES[0];
  return (
    <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1.3fr 0.7fr", gap: mobile ? 26 : 22, alignItems: "center" }}>
      <div style={{ borderRadius: 14, overflow: "hidden", background: "#fff", boxShadow: "0 40px 90px -50px rgba(4,8,14,0.5), 0 0 0 1px rgba(18,22,29,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#f6f6f5", borderBottom: "1px solid rgba(18,22,29,0.07)" }}>
          {[0, 1, 2].map((i) => <span key={i} style={{ width: 9, height: 9, borderRadius: 99, background: "#e5e5e4" }} />)}
          <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, color: MX.mute, background: "#fff", border: "1px solid rgba(18,22,29,0.07)", borderRadius: 6, padding: "3px 12px" }}>mineex.com/portal · publish</span>
        </div>
        <div style={{ padding: mobile ? 18 : 26 }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: MX.mute }}>New update · draft</div>
          <div style={{ fontSize: "clamp(18px,2vw,24px)", fontWeight: 800, letterSpacing: "-0.03em", marginTop: 10, lineHeight: 1.15 }}>{rel.label}</div>
          <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
            {["Overview", "Why it matters", "Media", "Followers"].map((t, i) => (
              <span key={t} style={{ fontSize: 12, fontWeight: 700, color: i === 0 ? "#fff" : MX.dim, background: i === 0 ? MX.ink : "#f1f2f3", borderRadius: 999, padding: "6px 12px" }}>{t}</span>
            ))}
          </div>
          <div style={{ marginTop: 16, height: 1, background: MX.hair }} />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 16, gap: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: MX.dim, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: published ? CB : "#cbd2da" }} />
              {published ? "Published to followers" : "Sends to everyone following your company"}
            </div>
            <button type="button" onClick={() => setPublished(true)} disabled={published}
              style={{ height: 44, padding: "0 22px", borderRadius: 999, border: 0, background: published ? "#e8f0ff" : CB, color: published ? CB_DEEP : "#fff", fontSize: 15, fontWeight: 700, cursor: published ? "default" : "pointer", fontFamily: "inherit", transition: `background .3s ${EASE}`, boxShadow: published ? "none" : "0 16px 30px -14px rgba(37,99,235,0.55)" }}>
              {published ? "Published ✓" : "Publish to followers"}
            </button>
          </div>
        </div>
      </div>
      <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
        <Phone width={mobile ? "min(58vw,230px)" : "min(20vw,220px)"}><PhoneMini /></Phone>
        <div style={{ position: "absolute", top: "8%", left: "8%", right: "8%", zIndex: 9 }}>
          <PushNotificationWrap shown={published} />
        </div>
      </div>
    </div>
  );
}
// tiny lock screen so the notification lands on a "different" context than the profile
function PhoneMini() {
  return (
    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(160deg,#0d1526,#080b14)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", paddingTop: "22%", color: "#fff" }}>
      <div style={{ fontSize: 46, fontWeight: 300, letterSpacing: "-0.02em" }}>9:41</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>Thursday, June 12</div>
    </div>
  );
}
function PushNotificationWrap({ shown }) {
  // local import wrapper so the release-titled push renders on the lock screen
  return <PushNotification shown={shown} />;
}

/* Return — the investor elsewhere, later; notification, then reopen. */
function ReturnIllustration() {
  const { mobile } = useViewport();
  const { published } = useDemo();
  return (
    <div style={{ position: "relative", background: "#fff", border: `1px solid ${MX.hair}`, borderRadius: 22, padding: mobile ? 22 : 34, display: "flex", alignItems: "center", justifyContent: "center", gap: 26, flexWrap: "wrap" }}>
      <div style={{ position: "relative" }}>
        <PhoneProfile width={mobile ? "min(64vw,250px)" : "min(22vw,250px)"} showNotif={published} />
      </div>
      <div style={{ maxWidth: 240 }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: published ? CB : MX.mute }}>
          {published ? "Notification delivered" : "Waiting on the next update"}
        </div>
        <p style={{ fontSize: 15, lineHeight: 1.55, color: MX.dim, marginTop: 12 }}>
          The same investor — now weeks later, somewhere else entirely. Because they followed, your update reaches them, and one tap reopens the company.
        </p>
        {published && <a href="#top" style={{ fontSize: 14, fontWeight: 700, color: CB_DEEP, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10 }}>Watch the loop again ↑</a>}
      </div>
    </div>
  );
}

/* ── PAGE ─────────────────────────────────────────────────────────────────── */
export default function MarketingV2() {
  useEffect(() => { document.title = "MineEx — the investor platform for junior mining"; }, []);
  return (
    <div className="mx-root" style={{ background: MX.sheet, color: MX.text }}>
      <MarketingStyles />
      <style>{`
        @keyframes mxv-spin { to { transform: rotate(360deg); } }
        .mx-root a { -webkit-tap-highlight-color: transparent; }
      `}</style>
      <Nav />
      <Hero />
      <Journey />
      <footer style={{ background: "#080b14", color: "rgba(255,255,255,0.6)", padding: "40px 0" }}>
        <Wrap style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <img src="/marketing/mineex-core.webp" alt="" width={22} height={22} />
            <span style={{ fontWeight: 700, color: "#fff" }}>MineEx</span>
          </div>
          <span style={{ fontSize: 13 }}>Pass 1 preview — Foundation · Hero · How MineEx Works</span>
        </Wrap>
      </footer>
    </div>
  );
}
