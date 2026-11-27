import { BookOpen } from "lucide-react";
import { list, rowName, type Data } from "@/lib/catalog";
import { Empty, Status } from "./ui";

export function SyllabusTree({data}:{data:Data}){
  const curricula=list(data,"syllabi");
  const chapters=list(data,"chapters");
  const topics=list(data,"topics");
  const subtopics=list(data,"subtopics");
  return <section className="panel padded-panel"><div className="panel-head"><div><h2>Curriculum outline</h2><p>Academic year, class, subject, and teaching topics.</p></div><span className="feature-icon purple"><BookOpen size={19}/></span></div>
    {curricula.length?<div className="syllabus-tree">{curricula.map(syllabus=><details key={syllabus.id}>
      <summary><strong>{rowName(data,"subjects",syllabus.subject_id)}</strong><span>{rowName(data,"classes",syllabus.class_id)} · {rowName(data,"academic_years",syllabus.academic_year_id)}</span></summary>
      <div>{chapters.filter(row=>row.syllabus_id===syllabus.id).sort((a,b)=>Number(a.position)-Number(b.position)).map(chapter=><details key={chapter.id}>
        <summary><strong>{String(chapter.name)}</strong></summary><div>{topics.filter(row=>row.chapter_id===chapter.id).map(topic=><details key={topic.id}>
          <summary>{String(topic.name)} <span>{String(topic.estimated_minutes)} min</span></summary><div>
          {list(data,"topic_progress").filter(row=>row.topic_id===topic.id&&!row.subtopic_id).map(row=><p key={row.id}>{rowName(data,"staff_assignments",row.staff_assignment_id)} · {String(row.completion)}% <Status value={row.status}/></p>)}
          {subtopics.filter(row=>row.topic_id===topic.id).map(row=><div key={row.id}>{String(row.name)} <small>{String(row.estimated_minutes)} min</small></div>)}</div>
        </details>)}</div></details>)}</div>
    </details>)}</div>:<Empty title="No curricula yet"/>}
  </section>;
}
