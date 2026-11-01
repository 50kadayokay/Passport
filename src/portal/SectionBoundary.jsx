// SectionBoundary — keeps one page's render crash inside that page (a28).
//
// The portal and Mission Control render every section inside their shell. A
// section that throws while rendering (an unexpected row shape, a null where a
// list item was expected) used to unmount the whole tree: a white screen with no
// sidebar, so the person could not even move to a page that works. This shows a
// short message in the section's place instead; the shell stays usable.
//
// `resetKey` (the section id) clears the error when the person navigates, so a
// different page is never stuck behind an old failure. "Try again" re-renders
// the same page, which is enough when the data has since been reloaded.
import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";

export default class SectionBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) { if (typeof console !== "undefined") console.error("[section]", this.props.resetKey, err); }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="mx-auto max-w-[560px] px-6 py-12" role="alert" data-section-error>
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]">
          <p className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-slate-900">
            <AlertCircle size={16} className="text-rose-500" /> This page couldn't be shown
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            Something in its data came back in a shape it didn't expect. Nothing was changed. Other pages still work.
          </p>
          <button onClick={() => this.setState({ err: null })}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-[13px] font-bold text-white transition hover:bg-slate-800">
            <RefreshCw size={13} /> Try again
          </button>
        </div>
      </div>
    );
  }
}
