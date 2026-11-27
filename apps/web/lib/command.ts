import { z } from "zod";
import { fieldsFor, modules } from "./catalog";

const id=z.uuid();
const date=z.iso.date();
const dateTime=z.iso.datetime({offset:true});
const note=z.string().max(8000).nullish();
const statusAttendance=["present","absent","late","excused"] as const;
export const attendanceStatuses=statusAttendance;
export const attentiveness=["highly_attentive","attentive","moderately_attentive","requires_attention","not_observed"] as const;
export const participation=["active","moderate","limited","not_observed"] as const;
export const understanding=["demonstrated_understanding","requires_practice","requires_revision","not_assessed"] as const;
export const workStatuses=["submitted","not_submitted","late","excused","under_review","evaluated"] as const;
export const scoreStatuses=["evaluated","absent","not_evaluated"] as const;

const schema=z.discriminatedUnion("operation",[
  z.object({operation:z.literal("save"),module:z.string().max(60),id,values:z.record(z.string(),z.unknown()),create:z.boolean(),weeks:z.number().int().min(1).max(52).optional()}),
  z.object({operation:z.literal("import"),module:z.enum(["students","staff","topics","subtopics"]),rows:z.array(z.record(z.string(),z.unknown())).min(1).max(300)}),
  z.object({operation:z.literal("session"),session:z.object({request_id:id,staff_assignment_id:id,timetable_id:id.nullish(),date,duration_minutes:z.number().int().min(1).max(1440),status:z.enum(["draft","completed"]),notes:note,revision:z.boolean(),actual_start:dateTime.nullish(),actual_end:dateTime.nullish()}),topics:z.array(id).max(500),subtopics:z.array(id).max(500),
    roster:z.array(z.object({student_id:id,status:z.enum(statusAttendance).nullish(),remarks:note,attentiveness:z.enum(attentiveness).nullish(),participation:z.enum(participation).nullish(),understanding:z.enum(understanding).nullish(),observation:note,completed_classwork:z.boolean().optional(),needs_support:z.boolean().optional(),follow_up:z.boolean().optional()})).max(2000)}),
  z.object({operation:z.literal("work-topics"),kind:z.enum(["assignments","assessments"]),parent:id,topics:z.array(id).max(250),questions:z.array(z.object({question_number:z.number().int().positive().max(1000),topic_id:id.nullable(),max_marks:z.number().finite().positive().max(1000000)})).max(60)}),
  z.object({operation:z.literal("roster"),kind:z.enum(["marks","assignments"]),parent:id,draft:z.boolean(),rows:z.array(z.object({student_id:id,status:z.string(),marks:z.number().finite().min(0).max(1_000_000).nullable(),feedback:note,question_marks:z.record(id,z.number().finite().min(0).max(1000000).nullable()).optional()})).min(1).max(2000)}),
  z.object({operation:z.literal("invite"),id,connectExisting:z.boolean().optional()}),
]);
export type Command = z.infer<typeof schema>;
export const parseCommand = (input:unknown) => schema.safeParse(input);
export function validateValues(module:string, values:Record<string,unknown>){
  const fields=modules[module]?.fields;
  if(!fields)throw new Error("This record cannot be edited here.");
  const parsed=fieldsFor(fields).safeParse(values);
  if(!parsed.success)throw new Error(parsed.error.issues.map(issue=>String(issue.path[0]).replaceAll("_"," ")+": "+issue.message).slice(0,3).join(". "));
  return parsed.data;
}

