// The large action tile used on Home and at the top of Press Releases.
//
// One definition in one file: these are the primary controls of the portal, and
// two copies drifting apart in size, hover or icon treatment would read as two
// different kinds of button doing the same kind of thing.

import React from "react";
import { ArrowRight } from "lucide-react";

/**
 * A Home launch tile.
 *
 * FIXED WIDTH, not a grid cell. A grid would stretch the two cards on the
 * second row to fill the row, and five controls that do the same KIND of thing
 * should not come in two sizes -- the width difference reads as importance the
 * design does not mean. So every tile is the same box and the rows centre
 * themselves, which also makes 3 + 2 fall out of plain wrapping rather than
 * being hand-placed.
 */
export default function LaunchTile({ title, body, Icon, onClick }) {
  return (
    <button
      onClick={onClick}
      className="group flex h-[160px] w-full flex-col items-start rounded-2xl border border-slate-200 bg-white p-5 text-left
                 shadow-[0_1px_2px_rgba(15,23,42,.04),0_10px_22px_-20px_rgba(15,23,42,.35)]
                 transition-all duration-[170ms] ease-out
                 hover:-translate-y-0.5 hover:border-slate-300
                 hover:shadow-[0_2px_5px_rgba(15,23,42,.05),0_16px_30px_-20px_rgba(15,23,42,.45)]
                 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40
                 sm:w-[calc(50%-0.5rem)] lg:w-[268px]"
    >
      <span className="flex w-full items-start justify-between">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600 transition-colors duration-[170ms] group-hover:bg-blue-50 group-hover:text-blue-600">
          <Icon size={21} strokeWidth={1.8} />
        </span>
        {/* Hover-only, and on the RIGHT. A permanent arrow in the corner was
            noise on a card that is entirely clickable anyway. */}
        <ArrowRight
          size={16}
          className="mt-3 -translate-x-1 text-slate-300 opacity-0 transition-all duration-[170ms] group-hover:translate-x-0 group-hover:text-blue-500 group-hover:opacity-100"
        />
      </span>
      <span className="mt-4 block text-[16.5px] font-bold leading-tight tracking-tight text-slate-900">{title}</span>
      <span className="mt-1.5 block text-[13px] leading-snug text-slate-500">{body}</span>
    </button>
  );
}
