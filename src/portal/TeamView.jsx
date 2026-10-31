// Settings → Team (a03). Who is on the company, what each role may do, and --
// for owners and admins -- invitations and role changes.
//
// Every rule is enforced by migration 0076 (list_members, invite_member,
// change_member_role, remove_member, list_invitations, revoke_invitation). This
// view only decides what to offer: `grantable` and each member's `manageable`
// come from the database, so the controls cannot drift from the rules, and any
// refusal the database returns is shown as-is.
import React, { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, UserPlus, X } from "lucide-react";
import { listMembers, listInvitations, inviteMember, revokeInvitation, changeMemberRole, removeMember, inviteLink, teamError } from "../lib/team.js";
import { ROLES, ROLE_SUMMARY } from "../lib/companyRoles.js";

const CARD = "rounded-2xl border border-slate-200 bg-white";
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const day = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return ""; } };

export default function TeamView({ company }) {
  const [data, setData] = useState(null);       // list_members result
  const [invites, setInvites] = useState(null); // list_invitations result (managers only)
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const m = await listMembers(company.id);
    setData(m);
    if (m.ok && (m.grantable || []).length) setInvites(await listInvitations(company.id));
    else setInvites(null);
  }, [company.id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, okNote) => {
    setErr(""); setNote("");
    const r = await fn();
    if (!r.ok) setErr(teamError(r.error));
    else if (okNote) setNote(okNote);
    await load();
    return r;
  };

  if (!data) return <p className="flex items-center gap-2 text-[13px] text-slate-500"><Loader2 size={14} className="animate-spin" /> Loading team…</p>;
  if (!data.ok) return <p className="text-[13px] font-semibold text-rose-500">{teamError(data.error)}</p>;

  const grantable = data.grantable || [];
  const manager = grantable.length > 0;

  return (
    <div className="space-y-6">
      <p className="text-[13px] text-slate-600">
        {manager
          ? data.my_role === "owner" || data.my_role === "platform_admin"
            ? "You can invite people, change roles below owner and remove members. Ownership changes go through MineEx."
            : "As an admin you can invite and manage editors, publishers, analysts and viewers. Owners and other admins are managed by an owner."
          : "Only owners and admins can invite, remove or change members. Ask one of them if something here needs to change."}
      </p>

      {err && <p role="alert" className="text-[13px] font-semibold text-rose-500">{err}</p>}
      {note && <p className="inline-flex items-center gap-1.5 text-[13px] font-bold text-slate-900"><Check size={13} strokeWidth={2.6} className="text-blue-600" />{note}</p>}

      <section>
        <h2 className="mb-2 text-[15px] font-extrabold text-slate-900">Members</h2>
        <ul className={`${CARD} divide-y divide-slate-100`}>
          {data.members.map((m) => (
            <MemberRow key={m.user_id} m={m} grantable={grantable}
              onRole={(role) => act(() => changeMemberRole(company.id, m.user_id, role, m.updated_at), `${m.email} is now ${cap(role)}.`)}
              onRemove={() => window.confirm(`Remove ${m.email} from ${company.name}? They lose access immediately.`) &&
                act(() => removeMember(company.id, m.user_id, m.updated_at), `${m.email} was removed.`)} />
          ))}
        </ul>
      </section>

      {manager && (
        <>
          <InviteForm grantable={grantable} onInvite={(email, role) => act(() => inviteMember(company.id, email, role))} />
          <section>
            <h2 className="mb-2 text-[15px] font-extrabold text-slate-900">Pending invitations</h2>
            {!invites ? null : !invites.ok ? <p className="text-[13px] text-rose-500">{teamError(invites.error)}</p>
              : invites.invitations.length === 0 ? <p className="text-[13px] text-slate-500">No pending invitations.</p>
              : (
                <ul className={`${CARD} divide-y divide-slate-100`}>
                  {invites.invitations.map((i) => (
                    <InviteRow key={i.id} i={i} onRevoke={() => act(() => revokeInvitation(company.id, i.id), `Invitation for ${i.email} revoked.`)} />
                  ))}
                </ul>
              )}
            <p className="mt-2 text-[12px] text-slate-500">Invitations are not emailed yet: copy the link and send it yourself. Each link works once, only for the email it names, and expires after 14 days.</p>
          </section>
        </>
      )}

      <section>
        <h2 className="mb-2 text-[15px] font-extrabold text-slate-900">What each role can do</h2>
        <dl className={`${CARD} divide-y divide-slate-100`}>
          {ROLES.map((r) => (
            <div key={r} className="flex gap-4 px-5 py-3">
              <dt className="w-24 shrink-0 text-[13px] font-bold text-slate-900">{cap(r)}</dt>
              <dd className="text-[13px] text-slate-600">{ROLE_SUMMARY[r]}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function MemberRow({ m, grantable, onRole, onRemove }) {
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const why = m.is_me ? "You" : m.is_account_owner ? "Account owner" : null;
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3" data-member={m.email}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-slate-900">{m.email}</p>
        {why && <p className="text-[12px] text-slate-500">{why}</p>}
      </div>
      {m.manageable ? (
        <>
          <select aria-label={`Role for ${m.email}`} value={m.role} disabled={busy}
            onChange={(e) => run(() => onRole(e.target.value))}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-[13px]">
            {grantable.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
          </select>
          <button type="button" onClick={() => run(onRemove)} disabled={busy}
            className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40">Remove</button>
        </>
      ) : (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] font-bold text-slate-700">{cap(m.role)}</span>
      )}
    </li>
  );
}

function InviteForm({ grantable, onInvite }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState(grantable.includes("editor") ? "editor" : grantable[0]);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setLink("");
    try { const r = await onInvite(email.trim(), role); if (r.ok) { setLink(inviteLink(r.token)); setEmail(""); } }
    finally { setBusy(false); }
  };
  return (
    <section>
      <h2 className="mb-2 text-[15px] font-extrabold text-slate-900">Invite someone</h2>
      <form onSubmit={submit} className={`${CARD} flex flex-col gap-2.5 p-5 sm:flex-row`}>
        <input type="email" required placeholder="name@company.com" aria-label="Email to invite" value={email} onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-slate-400" />
        <select aria-label="Role for the invitation" value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-[13.5px]">
          {grantable.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
        </select>
        <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <><UserPlus size={14} /> Create link</>}
        </button>
      </form>
      {link && <CopyLink link={link} />}
    </section>
  );
}

function CopyLink({ link }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2 flex items-center gap-2">
      <input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.target.select()} className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12.5px] text-slate-700" />
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] font-bold text-slate-700">
        {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function InviteRow({ i, onRevoke }) {
  const [show, setShow] = useState(false);
  return (
    <li className="px-5 py-3" data-invite={i.email}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-slate-900">{i.email}</p>
          <p className="text-[12px] text-slate-500">{cap(i.role)} · {i.expired ? "expired" : `expires ${day(i.expires_at)}`}</p>
        </div>
        {!i.expired && <button type="button" onClick={() => setShow((s) => !s)} className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-slate-700 hover:bg-slate-50">{show ? "Hide link" : "Show link"}</button>}
        {i.can_revoke && <button type="button" onClick={onRevoke} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold text-rose-600 hover:bg-rose-50"><X size={13} /> Revoke</button>}
      </div>
      {show && <CopyLink link={inviteLink(i.token)} />}
    </li>
  );
}
