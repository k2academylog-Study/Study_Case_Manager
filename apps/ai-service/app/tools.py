from collections import defaultdict
from datetime import date, datetime, timedelta, time
from uuid import UUID
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from fastapi import HTTPException
from psycopg import sql

from .db import Actor, database
from .schemas import Filters, QueryTool


COLUMNS = {
    "staff": "id,name,active", "classes": "id,name", "batches": "id,name,class_id,academic_year_id",
    "subjects": "id,name", "students": "id,name,batch_id,active",
    "staff_assignments": "id,staff_id,batch_id,subject_id,active",
    "student_enrollments": "student_id,batch_id,starts_on,ends_on",
    "class_sessions": "id,date,staff_assignment_id,duration_minutes,timetable_id,status",
    "attendance_records": "student_id,session_id,status",
    "student_observations": "student_id,session_id,attentiveness,participation,understanding,needs_support",
    "session_topics": "session_id,topic_id,revision", "session_subtopics": "session_id,subtopic_id,revision",
    "topics": "id,name,weight,estimated_minutes", "subtopics": "id,name,weight,estimated_minutes",
    "assessments": "id,title,staff_assignment_id,assessment_on,max_marks,pass_marks",
    "assessment_scores": "assessment_id,student_id,status,marks,draft",
    "assignments": "id,title,staff_assignment_id,assigned_on,due_on",
    "assignment_submissions": "assignment_id,student_id,status,marks",
    "topic_progress": "id,staff_assignment_id,topic_id,subtopic_id,completion,status,target_on",
    "syllabus_targets": "staff_assignment_id,target_on,target_completion",
    "timetable_entries": "id,title,staff_assignment_id,starts_at,ends_at,status",
    "calendar_events": "id,title,batch_id,event_type,starts_at,ends_at",
    "academic_interventions": "student_id,status,target_on,followup_on",
    "generated_reports": "report_type,subject_id,created_at",
}
PARENT = {
    "attendance_records": ("class_sessions", "session_id"),
    "student_observations": ("class_sessions", "session_id"),
    "session_topics": ("class_sessions", "session_id"),
    "session_subtopics": ("class_sessions", "session_id"),
    "assessment_scores": ("assessments", "assessment_id"),
    "assignment_submissions": ("assignments", "assignment_id"),
}
TEACHING = {"class_sessions", "assessments", "assignments", "topic_progress", "syllabus_targets", "timetable_entries"}


def pick(db, actor: Actor, table: str, condition=sql.SQL("true"), params=(), limit=6000):
    columns = sql.SQL(",").join(map(sql.Identifier,COLUMNS[table].split(",")))
    query = sql.SQL("select {} from public.{} where institution_id=%s and {} limit %s").format(
        columns, sql.Identifier(table), condition)
    rows = db.execute(query, (actor.institution, *params, limit + 1)).fetchall()
    if len(rows) > limit:
        raise HTTPException(422, "Narrow the scope to a shorter reporting period or a smaller cohort.")
    return rows


def day_window(filters: Filters, day: date):
    return filters.from_date or day - timedelta(days=60), filters.to_date or day


def load_bundle(actor: Actor, filters: Filters, tables: set[str]):
    with database() as db:
        settings = db.execute("select * from public.institution_settings where institution_id=%s", (actor.institution,)).fetchone() or {}
        zone = ZoneInfo(settings.get("timezone","Asia/Kolkata"))
        today = datetime.now(zone).date()
        start, stop = day_window(filters, today)
        if start > stop:
            raise HTTPException(422, "The reporting period is invalid.")
        teachers = pick(db,actor,"staff",sql.SQL("id=%s"),(actor.staff_id,)) if actor.role=="staff" else pick(db,actor,"staff")
        classes = pick(db,actor,"classes")
        batches = pick(db,actor,"batches")
        subjects = pick(db,actor,"subjects")
        teaching = pick(db,actor,"staff_assignments",sql.SQL("staff_id=%s and active"),(actor.staff_id,)) if actor.role=="staff" else pick(db,actor,"staff_assignments")
        if actor.role=="staff":
            allowed = {row["batch_id"] for row in teaching}
            batches = [row for row in batches if row["id"] in allowed]
            classes = [row for row in classes if row["id"] in {batch["class_id"] for batch in batches}]
            subjects = [row for row in subjects if row["id"] in {item["subject_id"] for item in teaching}]
        chosen_batches = [row["id"] for row in batches if (not filters.class_id or row["class_id"]==filters.class_id)
                          and (not filters.batch_id or row["id"]==filters.batch_id)]
        teaching = [row for row in teaching if row["batch_id"] in chosen_batches
                    and (not filters.subject_id or row["subject_id"]==filters.subject_id)
                    and (not filters.staff_id or row["staff_id"]==filters.staff_id)]
        if filters.subject_id or filters.staff_id:
            chosen_batches = list({row["batch_id"] for row in teaching})
        teaching_ids = [row["id"] for row in teaching]
        enrolled = pick(db,actor,"student_enrollments",sql.SQL("batch_id=any(%s::uuid[]) and starts_on<=%s and (ends_on is null or ends_on>=%s) and (%s::uuid is null or student_id=%s)"),(chosen_batches,stop,start,filters.student_id,filters.student_id))
        student_ids = list({r["student_id"] for r in enrolled})
        students = pick(db,actor,"students",sql.SQL("id=any(%s::uuid[])"),(student_ids,))
        result = {"settings":settings,"today":today,"from":start,"to":stop,"staff":teachers,"classes":classes,"batches":batches,"subjects":subjects,
                  "staff_assignments":teaching,"students":students,"student_enrollments":enrolled}
        for table in sorted(tables & TEACHING):
            condition = sql.SQL("staff_assignment_id=any(%s::uuid[])")
            params = (teaching_ids,)
            if table in {"class_sessions","assessments","assignments"}:
                field={"class_sessions":"date","assessments":"assessment_on","assignments":"assigned_on"}[table]
                condition += sql.SQL(" and {} between %s and %s").format(sql.Identifier(field))
                params += (start,stop)
                if table=="class_sessions":
                    condition += sql.SQL(" and status='completed'")
            if table=="timetable_entries":
                condition += sql.SQL(" and starts_at>=%s and starts_at<%s and status<>'cancelled'")
                params += (datetime.combine(start,time.min,zone),datetime.combine(stop+timedelta(days=1),time.min,zone))
            result[table] = pick(db,actor,table,condition,params)
        for table in sorted(tables & PARENT.keys()):
            parent, key = PARENT[table]
            parents = [r["id"] for r in result.get(parent,[])]
            condition = sql.SQL("{}=any(%s::uuid[])").format(sql.Identifier(key))
            params = (parents,)
            if table not in ("session_topics","session_subtopics"):
                condition += sql.SQL(" and student_id=any(%s::uuid[])")
                params += (student_ids,)
            if table=="assessment_scores":
                condition += sql.SQL(" and not draft")
            result[table] = pick(db,actor,table,condition,params)
        if "calendar_events" in tables:
            result["calendar_events"] = pick(db,actor,"calendar_events",sql.SQL("(batch_id is null or batch_id=any(%s::uuid[])) and starts_at<%s and ends_at>=%s"),
                       (chosen_batches,datetime.combine(stop+timedelta(days=1),time.min,zone),datetime.combine(start,time.min,zone)))
        for table in ("topics","subtopics"):
            if table not in tables:
                continue
            key = "topic_id" if table=="topics" else "subtopic_id"
            ids = list({row[key] for name in ("topic_progress","session_topics","session_subtopics") for row in result.get(name,[]) if row.get(key)})
            result[table]=pick(db,actor,table,sql.SQL("id=any(%s::uuid[])"),(ids,))
        if actor.role=="admin":
            if "academic_interventions" in tables:
                result["academic_interventions"]=pick(db,actor,"academic_interventions",sql.SQL("student_id=any(%s::uuid[])"),(student_ids,))
            if "generated_reports" in tables:
                result["generated_reports"]=pick(db,actor,"generated_reports",sql.SQL("report_type='student' and subject_id=any(%s::uuid[])"),(student_ids,))
    return result


def mean(values):
    return round(float(np.mean(values)),1) if len(values) else None


def ratio(top, total):
    return round(100*top/total,1) if total else None


def index(rows, key="id"):
    return {r[key]:r for r in rows}


def grouped(rows, key):
    groups=defaultdict(list)
    for row in rows:
        groups[row[key]].append(row)
    return groups


def calculate_performance(bundle):
    settings=bundle["settings"]
    sessions=index(bundle.get("class_sessions",[]))
    assessments=index(bundle.get("assessments",[]))
    assignments=index(bundle.get("assignments",[]))
    teaching=index(bundle["staff_assignments"])
    topics=index(bundle.get("topics",[]))
    subtopics=index(bundle.get("subtopics",[]))
    subjects=index(bundle["subjects"])
    attendance_by_student=grouped(bundle.get("attendance_records",[]),"student_id")
    scores_by_student=grouped(bundle.get("assessment_scores",[]),"student_id")
    submissions_by_student=grouped(bundle.get("assignment_submissions",[]),"student_id")
    enrolled=grouped(bundle["student_enrollments"],"student_id")
    work_by_batch=defaultdict(list)
    for work in assignments.values():
        work_by_batch[teaching[work["staff_assignment_id"]]["batch_id"]].append(work)
    coverage=grouped(bundle.get("session_topics",[]),"session_id")
    subcoverage=grouped(bundle.get("session_subtopics",[]),"session_id")
    observations=grouped(bundle.get("student_observations",[]),"student_id")
    interventions=grouped(bundle.get("academic_interventions",[]),"student_id")
    reports=grouped(bundle.get("generated_reports",[]),"subject_id")
    results={}
    for student in bundle["students"]:
        identifier=student["id"]
        records=sorted(attendance_by_student[identifier],key=lambda r:(sessions[r["session_id"]]["date"],str(r["session_id"])))
        eligible=[r for r in records if r["status"]!="excused" or not settings.get("exclude_excused",True)]
        attended=lambda r: r["status"]=="present" or (r["status"]=="late" and settings.get("late_present",True))
        score_entries=sorted((r for r in scores_by_student[identifier] if r["status"]=="evaluated" and r["marks"] is not None),
                             key=lambda r:(assessments[r["assessment_id"]]["assessment_on"],str(r["assessment_id"])))
        normalized=[float(r["marks"])/float(assessments[r["assessment_id"]]["max_marks"])*100 for r in score_entries]
        consecutive=0
        longest_absences=0
        missed_topics=set()
        revised_topics=set()
        missed_subjects=defaultdict(int)
        for r in eligible:
            current=session=sessions[r["session_id"]]
            named = [(topics[item["topic_id"]]["name"],item["revision"]) for item in coverage[current["id"]] if item["topic_id"] in topics]
            named += [(subtopics[item["subtopic_id"]]["name"],item["revision"]) for item in subcoverage[current["id"]] if item["subtopic_id"] in subtopics]
            if attended(r):
                consecutive=0
                recovered={name for name,revision in named if revision and name in missed_topics}
                revised_topics.update(recovered)
                missed_topics.difference_update(recovered)
            else:
                consecutive+=1
                longest_absences=max(longest_absences,consecutive)
                subject=subjects.get(teaching[session["staff_assignment_id"]]["subject_id"],{}).get("name","Subject")
                missed_subjects[subject]+=1
                missed_topics.update(name for name,_ in named)
        submitted=index(submissions_by_student[identifier],"assignment_id")
        due={work["id"] for enrollment in enrolled[identifier] for work in work_by_batch[enrollment["batch_id"]]
             if enrollment["starts_on"]<=work["assigned_on"] and (not enrollment["ends_on"] or work["assigned_on"]<=enrollment["ends_on"])
             and work["due_on"]<=min(bundle["today"],bundle["to"])}
        pending=sum(submitted.get(key,{}).get("status","not_submitted")=="not_submitted" for key in due)
        late=sum(r["status"]=="late" for r in submitted.values())
        scores=mean(normalized)
        decline=round(normalized[-2]-normalized[-1],1) if len(normalized)>1 else None
        rate=ratio(sum(attended(r) for r in eligible),len(eligible))
        flags=[]
        if rate is not None and rate<float(settings.get("attendance_threshold",75)): flags.append("low_attendance")
        if scores is not None and scores<float(settings.get("assessment_threshold",50)): flags.append("low_assessment_average")
        if decline is not None and decline>=float(settings.get("decline_threshold",15)): flags.append("assessment_decline")
        if pending>=settings.get("pending_threshold",3): flags.append("pending_assignments")
        if longest_absences>=settings.get("consecutive_absences",3): flags.append("consecutive_absences")
        results[str(identifier)]={
            "attendance":rate,"eligible_sessions":len(eligible),"average_assessment":scores,"evaluated_assessments":len(normalized),
            "latest_score":round(normalized[-1],1) if normalized else None,"previous_score":round(normalized[-2],1) if len(normalized)>1 else None,
            "decline_percentage_points":decline,"pending_assignments":pending,"late_submissions":late,
            "consecutive_missed_sessions":longest_absences,"missed_topics":sorted(missed_topics)[:15],"revised_topics":sorted(revised_topics)[:15],
            "missed_subject_counts":dict(missed_subjects),
            "teacher_support_observations":sum(bool(row.get("needs_support")) for row in observations[identifier]),
            "previous_interventions":len(interventions[identifier]),"previous_reports":len(reports[identifier]),"flags":flags,
        }
    return results


BUNDLE_METRICS={"class_sessions","attendance_records","session_topics","session_subtopics","assessments","assessment_scores","assignments","assignment_submissions","student_observations","topic_progress","topics","subtopics"}


def resolve_filter(rows, name, context):
    if not name:
        return None
    normalized=name.casefold().strip()
    def candidates(row):
        value=str(row["name"]).casefold()
        return {value,value.removeprefix("class "),value.removeprefix("batch ")}
    matches=[row["id"] for row in rows if normalized in candidates(row)]
    if len(matches)!=1:
        raise HTTPException(422, f"An unambiguous, accessible {context} is required for this filter.")
    return matches[0]


def tool_filters(actor,request: QueryTool):
    initial=load_bundle(actor,Filters(),set())
    class_id=resolve_filter(initial["classes"],request.class_name,"class")
    batches=[r for r in initial["batches"] if not class_id or r["class_id"]==class_id]
    batch_id=resolve_filter(batches,request.batch_name,"batch")
    students=[r for r in initial["students"] if not batch_id or r["batch_id"]==batch_id]
    return Filters(class_id=class_id,batch_id=batch_id,subject_id=resolve_filter(initial["subjects"],request.subject_name,"subject"),
                   student_id=resolve_filter(students,request.student_name,"student"),from_date=request.from_date,to_date=request.to_date)


def assessments_with_pending_scores(bundle):
    teaching=index(bundle["staff_assignments"])
    enrolled=grouped(bundle["student_enrollments"],"batch_id")
    finalized=grouped(bundle.get("assessment_scores",[]),"assessment_id")
    rows=[]
    for assessment in bundle.get("assessments",[]):
        day=assessment["assessment_on"]
        if day>bundle["today"]:
            continue
        a=teaching[assessment["staff_assignment_id"]]
        roster={r["student_id"] for r in enrolled[a["batch_id"]] if r["starts_on"]<=day and (not r["ends_on"] or day<=r["ends_on"])}
        reviewed={r["student_id"] for r in finalized[assessment["id"]] if r["status"]!="not_evaluated"}
        count=len(roster-reviewed)
        if count:
            rows.append({**assessment,"pending_scores":count})
    return rows


def run_tool(actor: Actor, request: QueryTool):
    filters=tool_filters(actor,request)
    name=request.tool
    tables={
        "student_profiles":set(),
        "staff_schedule":{"timetable_entries"},
        "teaching_hours":{"class_sessions"},
        "calendar":{"calendar_events","timetable_entries"},
        "syllabus":{"topic_progress","topics","subtopics","syllabus_targets"},
        "pending_records":{"timetable_entries","class_sessions","assignments","assignment_submissions","assessments","assessment_scores"},
        "observations":{"class_sessions","student_observations"},
    }.get(name,BUNDLE_METRICS)
    bundle=load_bundle(actor,filters,tables)
    students=index(bundle["students"])
    teacher=index(bundle["staff"])
    subjects=index(bundle["subjects"])
    batches=index(bundle["batches"])
    classes=index(bundle["classes"])
    teaching=index(bundle["staff_assignments"])
    def lookup(entities,key):
        return entities.get(key,{}).get("name")
    def context(row):
        allocation=teaching[row["staff_assignment_id"]]
        group=batches[allocation["batch_id"]]
        return {"subject":lookup(subjects,allocation["subject_id"]),"staff":lookup(teacher,allocation["staff_id"]),
                "class":lookup(classes,group["class_id"]),"batch":group["name"]}
    if name=="student_profiles":
        rows=[{"student":r["name"],"batch":lookup(batches,r["batch_id"]),"active":r["active"]} for r in students.values()]
    elif name in {"staff_schedule","calendar","pending_records"}:
        sessions={r["timetable_id"] for r in bundle.get("class_sessions",[])}
        rows=[{"title":r["title"],"starts_at":r["starts_at"],"ends_at":r["ends_at"],**context(r)}
              for r in bundle.get("timetable_entries",[]) if name!="pending_records" or
              (r["id"] not in sessions and r["starts_at"].date()<=bundle["today"])]
        if name=="calendar":
            rows+=bundle.get("calendar_events",[])
        if name=="pending_records":
            rows+=[{"pending_assessment":r["title"],"date":r["assessment_on"],"pending_scores":r["pending_scores"],**context(r)}
                   for r in assessments_with_pending_scores(bundle)]
    elif name=="teaching_hours":
        rows=[{"staff":person,"completed_sessions":len(included),"teaching_hours":round(sum(r["duration_minutes"] for r in included)/60,2)}
              for person,included in grouped([{**r,**context(r)} for r in bundle.get("class_sessions",[])],"staff").items()]
    elif name=="syllabus":
        targets=grouped(bundle.get("syllabus_targets",[]),"staff_assignment_id")
        topic_names=index(bundle.get("topics",[]))
        rows=[]
        for r in bundle.get("topic_progress",[]):
            target=sorted((t for t in targets[r["staff_assignment_id"]] if t["target_on"]<=bundle["today"]),key=lambda t:t["target_on"])
            rows.append({"topic":lookup(topic_names,r["topic_id"]),"completion":r["completion"],"topic_target_date":r["target_on"],
                        "status":r["status"],"teaching_target":target[-1]["target_completion"] if target else None,**context(r)})
    elif name=="observations":
        rows=[{k:v for k,v in r.items() if k not in {"session_id","student_id"}}|{"student":lookup(students,r["student_id"])} for r in bundle.get("student_observations",[])]
    else:
        metrics=calculate_performance(bundle)
        keys={
            "attendance":["attendance","eligible_sessions"],"assessments":["average_assessment","latest_score","previous_score"],
            "topic_attendance":["missed_topics","revised_topics","missed_subject_counts"],"assignments":["pending_assignments","late_submissions"],
        }
        if name in keys:
            fields=keys[name]
            rows=[]
            for sid,entry in metrics.items():
                primary=entry[fields[0]]
                if request.threshold is not None and isinstance(primary,(float,int)) and primary>=request.threshold:
                    continue
                rows.append({"student":lookup(students,UUID(sid)),**{key:entry[key] for key in fields}})
        else:
            exam=index(bundle.get("assessments",[]))
            metric_rows=[]
            enrollments=grouped(bundle["student_enrollments"],"student_id")
            for row in bundle.get("assessment_scores",[]):
                if row["status"]!="evaluated" or row["marks"] is None:
                    continue
                assessment=exam[row["assessment_id"]]
                if not any(e["starts_on"]<=assessment["assessment_on"] and (not e["ends_on"] or e["ends_on"]>=assessment["assessment_on"]) for e in enrollments[row["student_id"]]):
                    continue
                metric_rows.append({**context(assessment),"percent":float(row["marks"])*100/float(assessment["max_marks"])})
            column=name.split("_")[0]
            if metric_rows:
                frame=pd.DataFrame(metric_rows)
                if column=="batch":
                    frame["batch"]=frame["class"]+" · "+frame["batch"]
                rows=[{column:key,"average_assessment":round(float(group["percent"].mean()),1),"evaluated_scores":len(group)} for key,group in frame.groupby(column)]
            else:
                rows=[]
    return {"tool":name,"count":len(rows),"records":rows[:40],"truncated":len(rows)>40,"period":[bundle["from"],bundle["to"]]}

