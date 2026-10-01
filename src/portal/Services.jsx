// Services — what MineEx offers beyond the software.
//
// Every card opens a pre-filled enquiry to support@mineex.ca. That is the same
// contact route the sidebar's Help & support already uses, and it is deliberate:
// there is no pricing, cart or order table in this product, so anything that
// looked like a checkout would be a promise the system cannot keep. A company
// asks, a person answers.
//
// No prices are shown for the same reason -- none exist in the codebase, and
// inventing one on a page a customer reads is not a small mistake.

import React from "react";
import {
  Presentation, ShieldCheck, Globe, FileBarChart, PenTool, Camera, ArrowUpRight,
} from "lucide-react";

const CARD = "rounded-2xl border border-slate-100 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_26px_-20px_rgba(15,23,42,.4)]";

const SUPPORT = "support@mineex.ca";

// Names and descriptions are the company's own wording, not a paraphrase.
const SERVICES = [
  { id: "conference",   Icon: Presentation, title: "Conference Mode",
    body: "Interactive conference experiences" },
  { id: "managed",      Icon: ShieldCheck,  title: "Fully Managed MineEx",
    body: "Done-for-you MineEx presence" },
  { id: "websites",     Icon: Globe,        title: "Investor Websites",
    body: "Custom mining-company websites" },
  { id: "presentations", Icon: FileBarChart, title: "Corporate Presentations",
    body: "Investor/corporate decks" },
  { id: "brand",        Icon: PenTool,      title: "Brand & Logo Design",
    body: "Corporate identity and branding" },
  { id: "photography",  Icon: Camera,       title: "Photography",
    body: "Project, site, team and corporate photography" },
];

function ServiceTile({ service, companyName }) {
  const subject = `MineEx — ${service.title}`;
  const body = [
    `I'd like to know more about ${service.title}.`,
    "",
    companyName ? `Company: ${companyName}` : "",
    "",
    "",
  ].filter((l) => l !== null).join("\n");

  const href = `mailto:${SUPPORT}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <a
      href={href}
      className={`group flex h-[168px] w-full flex-col items-start p-5 text-left
                  transition-all duration-[170ms] ease-out hover:-translate-y-0.5 hover:border-slate-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40
                  sm:w-[calc(50%-0.5rem)] lg:w-[268px] ${CARD}`}
    >
      <span className="flex w-full items-start justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600 transition-colors duration-[170ms] group-hover:bg-blue-50 group-hover:text-blue-600">
          <service.Icon size={21} strokeWidth={1.8} />
        </span>
        <ArrowUpRight
          size={16}
          className="mt-3 -translate-x-1 text-slate-300 opacity-0 transition-all duration-[170ms] group-hover:translate-x-0 group-hover:text-blue-500 group-hover:opacity-100"
        />
      </span>
      <span className="mt-4 block text-[16.5px] font-bold leading-tight tracking-tight text-slate-900">{service.title}</span>
      <span className="mt-1.5 block text-[13px] leading-snug text-slate-500">{service.body}</span>
    </a>
  );
}

export default function Services({ company }) {
  return (
    <div>
      <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-slate-900">Services</h1>
      <p className="mt-1 text-[14px] text-slate-500">
        Services MineEx provides beyond the platform. Choose one and we'll be in touch.
      </p>

      <div className="mt-5 flex max-w-[836px] flex-wrap gap-4">
        {SERVICES.map((s) => (
          <ServiceTile key={s.id} service={s} companyName={company?.name || ""} />
        ))}
      </div>

      <p className="mt-6 max-w-[836px] text-[12px] leading-relaxed text-slate-400">
        Each opens an email to {SUPPORT} with your company name filled in. Nothing is ordered or charged from
        this page — a person replies with details and pricing.
      </p>
    </div>
  );
}
