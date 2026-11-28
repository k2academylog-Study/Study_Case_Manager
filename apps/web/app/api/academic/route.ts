import { NextResponse } from "next/server";
import { parseCommand, scoreStatuses, validateValues, workStatuses } from "@/lib/command";
import { modules } from "@/lib/catalog";
import { actor, apiAllowed, appUrl, serviceDb, staffAuthAccount } from "@/lib/supabase";
import { sendStaffInviteEmail } from "@/lib/email";

function fail(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }
function databaseError(error: { code?: string; message?: string }) {
  if (error.code === "P0001") return fail(error.message ?? "The change failed validation.");
  if (error.code === "23505") return fail("A matching record already exists.", 409);
  if (error.code === "23514") return fail("A value failed the academic validation rules.");
  if (error.code === "42501" || error.code === "23503") return fail("The selected record is unavailable.", 403);
  return fail("The database could not save this change.", 500);
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || ![new URL(request.url).origin, new URL(appUrl()).origin].includes(origin)) return fail("Invalid request origin.", 403);
  if (Number(request.headers.get("content-length") ?? 0) > 2_000_000) return fail("The request is too large.", 413);
  const user = await actor();
  if (!user) return fail("Sign in to continue.", 401);
  if (!await apiAllowed(user.client, "academic")) return fail("Too many academic requests. Try again shortly.", 429);
  const json = await request.text();
  if (json.length > 2_000_000) return fail("The request is too large.", 413);
  let body: unknown;
  try { body = JSON.parse(json); } catch { return fail("Invalid JSON request."); }
  const parsed = parseCommand(body);
  if (!parsed.success) return fail("Check the submitted fields.");
  const cmd = parsed.data, client = user.client, admin = user.role === "admin", institution_id = user.institution_id;
  try {
    const permission = cmd.operation === "work-topics" ? cmd.kind : cmd.operation === "session" ? "record_sessions" : cmd.operation === "roster" ? (cmd.kind === "marks" ? "assessments" : "assignments") :
      cmd.operation === "save" && ["syllabus", "assignments", "assessments"].includes(cmd.module) ? cmd.module : null;
    if (!admin && permission) {
      const { data, error } = await client.rpc("actor_permission", { capability: permission });
      if (error || data !== true) return fail("This capability is unavailable to staff.", 403);
    }
    if (cmd.operation === "save") {
      const module = modules[cmd.module];
      if (!module?.fields || (!admin && (module.adminOnly || !module.staffWrite))) return fail("This operation requires administrator approval.", 403);
      if (cmd.module === "students" && (!cmd.values.admission_number || String(cmd.values.admission_number).trim() === "")) {
        const { data: latestStudents } = await client.from("students").select("admission_number").order("created_at", { ascending: false }).limit(20);
        let maxNum = 1000;
        let prefix = "SCM-";
        if (latestStudents) {
          for (const s of latestStudents) {
            const str = String(s.admission_number ?? "").trim();
            const match = str.match(/^(.*?)(\d+)$/);
            if (match) {
              if (match[1]) prefix = match[1];
              const num = parseInt(match[2], 10);
              if (!isNaN(num) && num > maxNum) maxNum = num;
            }
          }
        }
        cmd.values.admission_number = `${prefix}${maxNum + 1}`;
      }
      const values = validateValues(cmd.module, cmd.values);
      if (cmd.module === "students") {
        const { data, error } = await client.rpc("save_student_profile", { p_id: cmd.id, p_value: values, p_create: cmd.create });
        return error ? databaseError(error) : NextResponse.json({ id: data });
      }
      if (cmd.weeks && cmd.weeks > 1) {
        if (!admin || cmd.module !== "timetable" || !cmd.create || values.status !== "scheduled") return fail("Select a new scheduled class for recurrence.");
        const { data, error } = await client.rpc("schedule_recurrence", { p_value: values, p_weeks: cmd.weeks });
        return error ? databaseError(error) : NextResponse.json({ data });
      }
      const payload = { ...values, institution_id, id: cmd.id };
      const result = cmd.create
        ? await client.from(module.table).upsert(payload, { onConflict: "id", ignoreDuplicates: true }).select("id")
        : await client.from(module.table).update(values).eq("id", cmd.id).eq("institution_id", institution_id).select("id");
      if (result.error) return databaseError(result.error);
      if (!result.data?.length) {
        const { data } = await client.from(module.table).select("id").eq("id", cmd.id).eq("institution_id", institution_id).maybeSingle();
        if (!cmd.create || !data) return fail("This record is unavailable.", 404);
      }
      return NextResponse.json({ id: cmd.id });
    }
    if (cmd.operation === "import") {
      if (!admin) return fail("Administrator access is required.", 403);
      const rows = cmd.rows.map((row, index) => {
        try { return { ...validateValues(cmd.module, row), institution_id }; }
        catch (error) { throw new Error("Row " + (index + 2) + ". " + (error as Error).message); }
      });
      const { error } = cmd.module === "students"
        ? await client.rpc("import_student_profiles", { p_rows: rows })
        : await client.from(modules[cmd.module].table).insert(rows);
      return error ? databaseError(error) : NextResponse.json({ count: rows.length });
    }
    if (cmd.operation === "session") {
      const { data, error } = await client.rpc("record_class_session", { p_session: cmd.session, p_topics: cmd.topics, p_subtopics: cmd.subtopics, p_roster: cmd.roster });
      return error ? databaseError(error) : NextResponse.json({ id: data });
    }
    if (cmd.operation === "work-topics") {
      const { data, error } = await client.rpc("save_work_topics", { p_kind: cmd.kind, p_parent: cmd.parent, p_topics: cmd.topics, p_questions: cmd.questions });
      return error ? databaseError(error) : NextResponse.json({ saved: data === true });
    }
    if (cmd.operation === "roster") {
      const marks = cmd.kind === "marks";
      const selected = marks ? scoreStatuses : workStatuses;
      if (cmd.rows.some(row => !(selected as readonly string[]).includes(row.status) || (marks && (row.status === "evaluated") !== (row.marks !== null)))) return fail("Check the status and marks for each student.");
      const { error } = marks
        ? await client.rpc("save_assessment_roster", { p_parent: cmd.parent, p_rows: cmd.rows, p_draft: cmd.draft })
        : await client.from("assignment_submissions").upsert(cmd.rows.map(({ student_id, status, marks, feedback }) => ({ student_id, status, marks, feedback, assignment_id: cmd.parent, institution_id })), { onConflict: "assignment_id,student_id" });
      return error ? databaseError(error) : NextResponse.json({ count: cmd.rows.length });
    }
    if (cmd.operation === "delete") {
      if (!admin) return fail("This operation requires administrator approval.", 403);
      const module = modules[cmd.module];
      if (!module) return fail("Invalid module.", 400);
      const service = serviceDb();
      if (cmd.module === "chapters") {
        const { data: topics } = await service.from("topics").select("id").eq("chapter_id", cmd.id).eq("institution_id", institution_id);
        if (topics && topics.length > 0) {
          const topicIds = topics.map((t: { id: string }) => t.id);
          await service.from("subtopics").delete().in("topic_id", topicIds).eq("institution_id", institution_id);
          await service.from("topics").delete().eq("chapter_id", cmd.id).eq("institution_id", institution_id);
        }
      } else if (cmd.module === "topics") {
        await service.from("subtopics").delete().eq("topic_id", cmd.id).eq("institution_id", institution_id);
      } else if (cmd.module === "staff") {
        const { data: staffProfiles } = await service.from("profiles").select("id, user_id").eq("staff_id", cmd.id).eq("institution_id", institution_id);
        if (staffProfiles && staffProfiles.length > 0) {
          const profileIds = staffProfiles.map((p: { id: string }) => p.id);
          await service.from("user_roles").delete().in("profile_id", profileIds).eq("institution_id", institution_id);
          await service.from("profiles").delete().in("id", profileIds).eq("institution_id", institution_id);
          for (const p of staffProfiles) {
            if (p.user_id) {
              try { await service.auth.admin.deleteUser(p.user_id); } catch { /* ignore if already deleted */ }
            }
          }
        }
        await service.from("staff_contact_preferences").delete().eq("staff_id", cmd.id).eq("institution_id", institution_id);
        const { data: assignments } = await service.from("staff_assignments").select("id").eq("staff_id", cmd.id).eq("institution_id", institution_id);
        if (assignments && assignments.length > 0) {
          const asgnIds = assignments.map((a: { id: string }) => a.id);
          await service.from("timetable_entries").delete().in("staff_assignment_id", asgnIds).eq("institution_id", institution_id);
          await service.from("topic_progress").delete().in("staff_assignment_id", asgnIds).eq("institution_id", institution_id);
          await service.from("syllabus_targets").delete().in("staff_assignment_id", asgnIds).eq("institution_id", institution_id);

          const { data: sessions } = await service.from("class_sessions").select("id").in("staff_assignment_id", asgnIds).eq("institution_id", institution_id);
          if (sessions && sessions.length > 0) {
            const sIds = sessions.map((s: { id: string }) => s.id);
            await service.from("attendance_records").delete().in("session_id", sIds);
            await service.from("student_observations").delete().in("session_id", sIds);
            await service.from("session_topics").delete().in("session_id", sIds);
            await service.from("session_subtopics").delete().in("session_id", sIds);
            await service.from("class_sessions").delete().in("staff_assignment_id", asgnIds).eq("institution_id", institution_id);
          }

          const { data: assessments } = await service.from("assessments").select("id").in("staff_assignment_id", asgnIds).eq("institution_id", institution_id);
          if (assessments && assessments.length > 0) {
            const assessIds = assessments.map((a: { id: string }) => a.id);
            await service.from("assessment_question_scores").delete().in("assessment_id", assessIds);
            await service.from("assessment_questions").delete().in("assessment_id", assessIds);
            await service.from("assessment_scores").delete().in("assessment_id", assessIds);
            await service.from("assessments").delete().in("staff_assignment_id", asgnIds).eq("institution_id", institution_id);
          }

          const { data: work } = await service.from("assignments").select("id").in("staff_assignment_id", asgnIds).eq("institution_id", institution_id);
          if (work && work.length > 0) {
            const workIds = work.map((w: { id: string }) => w.id);
            await service.from("assignment_submissions").delete().in("assignment_id", workIds);
            await service.from("assignment_topics").delete().in("assignment_id", workIds);
            await service.from("assignments").delete().in("staff_assignment_id", asgnIds).eq("institution_id", institution_id);
          }

          await service.from("staff_assignments").delete().eq("staff_id", cmd.id).eq("institution_id", institution_id);
        }
        await service.from("academic_interventions").delete().eq("staff_id", cmd.id).eq("institution_id", institution_id);
        await service.from("communication_recipients").delete().eq("staff_id", cmd.id).eq("institution_id", institution_id);
        await service.from("generated_reports").delete().eq("staff_id", cmd.id).eq("institution_id", institution_id);
      }
      const { error } = await service.from(module.table).delete().eq("id", cmd.id).eq("institution_id", institution_id);
      return error ? databaseError(error) : NextResponse.json({ deleted: true });
    }
    if (!admin) return fail("Administrator access is required.", 403);
    const { data: staff } = await client.from("staff").select("id,email,name,active").eq("id", cmd.id).eq("institution_id", institution_id).maybeSingle();
    if (!staff?.email || !staff.active) return fail("Select an active staff member with an email address.");
    const service = serviceDb();

    // Generate a readable, secure temporary password
    const chars = "abcdefghjkmnpqrstuvwxyz";
    const uppers = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const nums = "23456789";
    const syms = "@#$%!";
    const r = (set: string) => set[Math.floor(Math.random() * set.length)];
    const tempPassword = `K2@${r(uppers)}${r(chars)}${r(chars)}${r(nums)}${r(nums)}${r(nums)}${r(nums)}${r(syms)}`;

    let targetUserId: string;
    const existingAccount = await staffAuthAccount(staff.email);
    if (existingAccount) {
      targetUserId = existingAccount.id;
      const { error: updateError } = await service.auth.admin.updateUserById(targetUserId, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: { must_change_password: true, staff_id: staff.id, name: staff.name }
      });
      if (updateError) return fail(updateError.message || "Failed to update staff credentials.", 502);
    } else {
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email: staff.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { must_change_password: true, staff_id: staff.id, name: staff.name }
      });
      if (createError || !created?.user) {
        return fail(createError?.message || "Failed to create staff login account.", 502);
      }
      targetUserId = created.user.id;
    }

    const { data: existingProfile } = await service.from("profiles").select("id, user_id").eq("staff_id", staff.id).eq("institution_id", institution_id).maybeSingle();
    if (!existingProfile) {
      const { error: linkError } = await service.rpc("link_invited_staff", {
        p_institution: institution_id,
        p_staff: staff.id,
        p_user: targetUserId,
        p_name: staff.name
      });
      if (linkError) return fail("Could not link staff profile to institutional account.", 502);
    } else if (existingProfile.user_id !== targetUserId) {
      await service.from("profiles").update({ user_id: targetUserId }).eq("id", existingProfile.id);
      const { data: roleRow } = await service.from("user_roles").select("id").eq("profile_id", existingProfile.id).eq("institution_id", institution_id).maybeSingle();
      if (!roleRow) {
        await service.from("user_roles").insert({ profile_id: existingProfile.id, institution_id, role: "staff" });
      }
    }

    return NextResponse.json({
      id: staff.id,
      email: staff.email,
      name: staff.name,
      temporaryPassword: tempPassword,
      mustChangePassword: true
    });
  } catch (error) {
    return fail(error instanceof Error && ["save", "import"].includes(cmd.operation) ? error.message : "This operation could not be completed. Check institutional configuration.");
  }
}

