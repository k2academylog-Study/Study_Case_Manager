import { describe, expect, it } from "vitest";
import { demoData, staffDemo } from "../../lib/demo";
import { attendance, marks, scope, syllabusProgress } from "../../lib/metrics";
import { fieldsFor, modules } from "../../lib/catalog";
import { validRoute } from "../../lib/routing";
import { applyDemo } from "../../lib/demo-command";
import { makeReport } from "../../lib/report";

describe("academic metrics",()=>{
  it("respects eligible attendance rules and returns null for missing information",()=>{
    const rows=[{id:"1",status:"present"},{id:"2",status:"late"},{id:"3",status:"excused"},{id:"4",status:"absent"}];
    expect(attendance(rows)).toEqual({eligible:3,attended:2,missed:1,rate:66.7});
    expect(attendance(rows,{id:"settings",late_present:false,exclude_excused:false}).rate).toBe(25);
    expect(attendance([]).rate).toBeNull();
  });
  it("normalizes only evaluated finalized scores",()=>{
    const data={assessments:[{id:"test",max_marks:50}]};
    const base={assessment_id:"test"};
    expect(marks(data,[{...base,id:"1",status:"evaluated",marks:40},{...base,id:"2",status:"absent",marks:null},{...base,id:"3",status:"evaluated",marks:50,draft:true}])).toEqual([80]);
  });
  it("weights progress and avoids double-counting a topic and its recorded subtopic",()=>{
    const data={topics:[{id:"a",weight:2},{id:"b",weight:1}]};
    expect(syllabusProgress(data,[{id:"1",staff_assignment_id:"x",topic_id:"a",completion:100},{id:"2",staff_assignment_id:"x",topic_id:"a",subtopic_id:"sub",completion:20},{id:"3",staff_assignment_id:"x",topic_id:"b",completion:0}])).toBe(66.7);
  });
  it("uses historical enrollment in an individual report",()=>{
    const data=demoData("2026-11-27");
    const student=data.students[0];
    const result=makeReport(data,{type:"student",personId:student.id,from:"2026-11-01",to:"2026-11-27"});
    expect(result.person).toBe(student.name);
    expect(result.sections.find(section=>section.title==="Subject attendance")?.rows.length).toBeGreaterThan(0);
    expect(result.sections.find(section=>section.title==="Enrollment history")?.rows).toHaveLength(1);
  });
});
describe("workspace integrity",()=>{
  it("separates administrator and staff routes and demo records",()=>{
    const data=demoData("2026-11-27");
    const staff=staffDemo(data);
    expect(validRoute("staff","students")).toBe(false);
    expect(validRoute("staff","ai/communication")).toBe(false);
    expect(validRoute("admin","ai/interventions")).toBe(true);
    expect(staff.staff).toHaveLength(1);
    expect(scope(staff,{}).students.length).toBeLessThan(scope(data,{}).students.length);
  });
  it("validates required profile fields",()=>{
    expect(fieldsFor(modules.students.fields!).safeParse({name:""}).success).toBe(false);
  });
  it("rejects timetable conflicts in the demo",()=>{
    const data=demoData("2026-11-27");
    const event=data.timetable_entries[0];
    expect(()=>applyDemo(data,{operation:"save",module:"timetable",id:crypto.randomUUID(),create:true,values:event})).toThrow("conflicts");
  });
});
