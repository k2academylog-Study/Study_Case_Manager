import { modules, type Role } from "./catalog";
const adminSpecial=/^(dashboard|reports(?:\/(?:students|staff)\/[\da-f-]{36})?|analytics\/(students|staff|academic)|ai\/(student-performance|assistant|communication)|(?:students|staff)\/(?:add|[\da-f-]{36}(?:\/edit)?))$/i;
const staffRoutes=new Set(["dashboard","my-classes","class-sessions","attendance","syllabus","student-observations","assignments","assessments","marks","student-performance","calendar","timetable","ai/assistant","notifications","profile"]);
export function validRoute(role:Role,route:string){
  return role==="staff"?staffRoutes.has(route):adminSpecial.test(route)||Object.hasOwn(modules,route)&&!["my-classes","marks","student-performance","profile","student-observations"].includes(route);
}
