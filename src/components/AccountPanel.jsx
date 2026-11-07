import React, { useCallback, useEffect, useState } from "react";
import { Building2, Camera, Mail, Shield, UserPlus } from "lucide-react";
import { supabase } from "../lib/supabase.js";

function messageFromError(error) {
  if (error instanceof Error) return error.message;
  return "The account request failed.";
}

export default function AccountPanel({ session, profile, onProfileChange }) {
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [branches, setBranches] = useState([]);
  const [staff, setStaff] = useState([]);
  const [staffEdits, setStaffEdits] = useState({});
  const [invite, setInvite] = useState({ email: "", fullName: "" });
  const [inviting, setInviting] = useState(false);
  const [savingStaffId, setSavingStaffId] = useState("");
  const [branchDraft, setBranchDraft] = useState({ code: "", name: "", address: "", phone: "" });
  const [creatingBranch, setCreatingBranch] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name || "");
    setPhone(profile?.phone || "");
    setAvatarUrl(profile?.avatar_url || "");
  }, [profile]);

  useEffect(() => {
    let active = true;
    supabase.from("profiles")
      .select("id, email, full_name, phone, avatar_url, role, branch_id, is_active")
      .eq("id", session.user.id)
      .single()
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) setError(requestError.message);
        else onProfileChange(data);
      })
      .catch((requestError) => {
        if (active) setError(messageFromError(requestError));
      });
    return () => { active = false; };
  }, [session.user.id, onProfileChange]);

  const loadStaff = useCallback(async () => {
    if (!supabase || profile?.role !== "admin") return;
    const [{ data: branchRows, error: branchError }, { data: staffRows, error: staffError }] = await Promise.all([
      supabase.from("branches").select("id, code, name, address, phone").order("name"),
      supabase.from("profiles").select("id, email, full_name, phone, role, branch_id, is_active").order("full_name")
    ]);
    if (branchError) throw new Error(branchError.message);
    if (staffError) throw new Error(staffError.message);
    setBranches(branchRows || []);
    setStaff(staffRows || []);
    setStaffEdits(Object.fromEntries((staffRows || []).map((person) => [person.id, { ...person }])));
  }, [profile?.role]);

  useEffect(() => {
    loadStaff().catch((requestError) => setError(messageFromError(requestError)));
  }, [loadStaff]);

  const saveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);
    setError("");
    setMessage("");
    try {
      const { data, error: requestError } = await supabase.rpc("update_my_profile", {
        p_full_name: fullName,
        p_phone: phone,
        p_avatar_url: avatarUrl
      });
      if (requestError) throw new Error(requestError.message);
      onProfileChange(data);
      setMessage("Profile saved.");
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("Choose a JPEG, PNG, or WebP image smaller than 2 MB.");
      return;
    }
    setUploadingAvatar(true);
    setError("");
    setMessage("");
    try {
      const extension = file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("profile-avatars").upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false
      });
      if (uploadError) throw new Error(uploadError.message);
      const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const inviteStaff = async (event) => {
    event.preventDefault();
    setInviting(true);
    setError("");
    setMessage("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("admin-invite-user", {
        body: { email: invite.email, fullName: invite.fullName, redirectTo: window.location.origin }
      });
      if (invokeError) {
        let detail = invokeError.message;
        const status = invokeError.context instanceof Response ? invokeError.context.status : 0;
        try {
          const response = invokeError.context instanceof Response
            ? await invokeError.context.json()
            : null;
          if (response?.error || response?.message) detail = response.error || response.message;
        } catch {
          // Keep the Functions client error when the response has no JSON body.
        }
        if (status === 404) {
          detail = "The admin-invite-user Edge Function is not deployed. Deploy it to this Supabase project, then retry.";
        } else if ((status === 401 || status === 403) && (!detail || detail === invokeError.message)) {
          detail = "The invitation request was rejected. Sign in again and confirm that this account is an active administrator.";
        }
        if (/failed to send|smtp|email provider/i.test(detail)) {
          detail = `Supabase could not send the invitation email: ${detail}. Check Authentication → SMTP Settings and the email provider logs.`;
        }
        if (/failed to send a request|failed to fetch|network|load failed/i.test(detail)) {
          detail = "Could not reach the invitation service. Check the internet connection and confirm the admin-invite-user Edge Function is deployed.";
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);
      setInvite({ email: "", fullName: "" });
      setMessage("Invitation sent. The new account must be activated and assigned a branch below.");
      await loadStaff();
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setInviting(false);
    }
  };

  const updateStaffEdit = (userId, key, value) => {
    setStaffEdits((current) => ({ ...current, [userId]: { ...current[userId], [key]: value } }));
  };

  const saveStaff = async (userId) => {
    const person = staffEdits[userId];
    setSavingStaffId(userId);
    setError("");
    setMessage("");
    try {
      const { error: requestError } = await supabase.rpc("admin_update_staff_profile", {
        p_user_id: userId,
        p_full_name: person.full_name,
        p_phone: person.phone || "",
        p_role: person.role,
        p_branch_id: person.branch_id || null,
        p_is_active: person.is_active
      });
      if (requestError) throw new Error(requestError.message);
      setMessage(`Account ${person.email || person.full_name} updated.`);
      await loadStaff();
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setSavingStaffId("");
    }
  };

  const createBranch = async (event) => {
    event.preventDefault();
    const branch = {
      code: branchDraft.code.trim().toUpperCase(),
      name: branchDraft.name.trim(),
      address: branchDraft.address.trim() || null,
      phone: branchDraft.phone.trim() || null,
      is_active: true
    };
    if (!/^[A-Z0-9_-]{2,20}$/.test(branch.code)) {
      setError("Branch code must be 2–20 letters, numbers, hyphens, or underscores.");
      return;
    }
    setCreatingBranch(true);
    setError("");
    setMessage("");
    try {
      const { error: requestError } = await supabase.from("branches").insert(branch);
      if (requestError) throw new Error(requestError.message);
      setBranchDraft({ code: "", name: "", address: "", phone: "" });
      setMessage(`Branch ${branch.code} created. You can now assign staff accounts to it.`);
      await loadStaff();
    } catch (requestError) {
      setError(messageFromError(requestError));
    } finally {
      setCreatingBranch(false);
    }
  };

  return <section className="panel account-panel">
    <div className="panel-title">
      <div><h3>Account</h3><p className="panel-subtitle">Your staff profile and account settings.</p></div>
      <span className="role-badge"><Shield size={14}/>{profile?.role === "admin" ? "Administrator" : "Staff"}</span>
    </div>
    {error && <p className="form-error">{error}</p>}
    {message && <p className="notice success">{message}</p>}
    <form className="account-profile" onSubmit={saveProfile}>
      <div className="avatar-upload">
        {avatarUrl ? <img src={avatarUrl} alt="Profile" /> : <div className="avatar-placeholder">{(fullName || session.user.email || "?").slice(0, 1).toUpperCase()}</div>}
        <label className="btn secondary"><Camera size={15}/>{uploadingAvatar ? "Uploading…" : "Upload photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} disabled={uploadingAvatar}/></label>
      </div>
      <div className="account-fields">
        <label className="field"><span>Full name</span><input required maxLength={120} value={fullName} onChange={(event) => setFullName(event.target.value)}/></label>
        <label className="field"><span>Email</span><input value={profile?.email || session.user.email || ""} readOnly/></label>
        <label className="field"><span>Phone</span><input maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)}/></label>
        <label className="field"><span>Role</span><input value={profile?.role || "staff"} readOnly/></label>
        <button className="btn primary account-save" type="submit" disabled={savingProfile || uploadingAvatar}>{savingProfile ? "Saving…" : "Save profile"}</button>
      </div>
    </form>

    {profile?.role === "admin" && <div className="admin-accounts">
      <h3>Branches</h3>
      <form className="invite-form branch-form" onSubmit={createBranch}>
        <div className="invite-heading"><Building2 size={17}/><strong>New branch</strong></div>
        <div className="form-grid">
          <label className="field"><span>Branch code</span><input required maxLength={20} placeholder="e.g. MDY" value={branchDraft.code} onChange={(event) => setBranchDraft({ ...branchDraft, code: event.target.value })}/></label>
          <label className="field"><span>Branch name</span><input required maxLength={120} value={branchDraft.name} onChange={(event) => setBranchDraft({ ...branchDraft, name: event.target.value })}/></label>
          <label className="field"><span>Address (optional)</span><input maxLength={240} value={branchDraft.address} onChange={(event) => setBranchDraft({ ...branchDraft, address: event.target.value })}/></label>
          <label className="field"><span>Phone (optional)</span><input maxLength={40} value={branchDraft.phone} onChange={(event) => setBranchDraft({ ...branchDraft, phone: event.target.value })}/></label>
        </div>
        <button className="btn primary" type="submit" disabled={creatingBranch}><Building2 size={14}/>{creatingBranch ? "Creating…" : "Create branch"}</button>
      </form>
      <div className="branch-list">
        {branches.map((branch) => <div className="branch-card" key={branch.id}><strong>{branch.name}</strong><span>{branch.code}</span><small>{branch.address || "No address"} · {branch.phone || "No phone"}</small></div>)}
      </div>
      <h3>Staff accounts</h3>
      <form className="invite-form" onSubmit={inviteStaff}>
        <div className="invite-heading"><UserPlus size={17}/><strong>Invite an account</strong></div>
        <div className="form-grid">
          <label className="field"><span>Full name</span><input required maxLength={120} value={invite.fullName} onChange={(event) => setInvite({ ...invite, fullName: event.target.value })}/></label>
          <label className="field"><span>Email</span><input required type="email" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })}/></label>
        </div>
        <button className="btn primary" type="submit" disabled={inviting}><Mail size={14}/>{inviting ? "Sending…" : "Send invite"}</button>
        <p>Supabase sends a secure password setup link. New accounts remain inactive until assigned a branch and activated below.</p>
      </form>
      <div className="staff-list">
        {staff.map((person) => {
          const edit = staffEdits[person.id] || person;
          return <article className="staff-card" key={person.id}>
            <div className="staff-card-heading"><strong>{person.full_name || "New account"}</strong><span>{person.email || "Email pending"}</span></div>
            <div className="staff-edit-grid">
              <label className="field"><span>Name</span><input value={edit.full_name || ""} onChange={(event) => updateStaffEdit(person.id, "full_name", event.target.value)}/></label>
              <label className="field"><span>Phone</span><input value={edit.phone || ""} onChange={(event) => updateStaffEdit(person.id, "phone", event.target.value)}/></label>
              <label className="field"><span>Role</span><select value={edit.role} onChange={(event) => updateStaffEdit(person.id, "role", event.target.value)}><option value="staff">Staff</option><option value="admin">Admin</option></select></label>
              <label className="field"><span>Branch</span><select value={edit.branch_id || ""} onChange={(event) => updateStaffEdit(person.id, "branch_id", event.target.value)}><option value="">Unassigned</option>{branches.map((branch) => <option value={branch.id} key={branch.id}>{branch.name} ({branch.code})</option>)}</select></label>
              <label className="staff-active"><input type="checkbox" checked={Boolean(edit.is_active)} onChange={(event) => updateStaffEdit(person.id, "is_active", event.target.checked)}/> Active</label>
              <button className="btn secondary" onClick={() => saveStaff(person.id)} disabled={savingStaffId === person.id}>{savingStaffId === person.id ? "Saving…" : "Save account"}</button>
            </div>
          </article>;
        })}
      </div>
    </div>}
  </section>;
}
