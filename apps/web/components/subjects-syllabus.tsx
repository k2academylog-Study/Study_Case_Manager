"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  BookOpen, 
  ChevronDown, 
  ChevronRight, 
  Clock, 
  Edit2, 
  FolderPlus, 
  GraduationCap, 
  Layers, 
  Plus, 
  PlusCircle, 
  Trash2, 
  UserRound, 
  UsersRound,
  Sparkles,
  FileText
} from "lucide-react";
import { list, rowName, type Data, type Item } from "@/lib/catalog";
import { PageHeading, Empty, Status, Notice } from "./ui";
import { Modal, type RunCommand } from "./records";

export function SubjectsSyllabus({
  data,
  role,
  base,
  run
}: {
  data: Data;
  role: string;
  base: string;
  run: RunCommand;
}) {
  const admin = role === "admin";
  const classes = list(data, "classes");
  const allBatches = list(data, "batches");
  const allSubjects = list(data, "subjects");
  const allStaffAssignments = list(data, "staff_assignments");
  const allCurricula = list(data, "syllabi");
  const allChapters = list(data, "chapters");
  const allTopics = list(data, "topics");
  const allSubtopics = list(data, "subtopics");
  const allAcademicYears = list(data, "academic_years");

  // Selection states
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id ?? "");
  const classBatches = allBatches.filter(b => b.class_id === selectedClassId);
  const [selectedBatchId, setSelectedBatchId] = useState<string>(classBatches[0]?.id ?? "");

  // Update batch if current selected doesn't belong to selected class
  const activeBatch = classBatches.find(b => b.id === selectedBatchId) ?? classBatches[0];
  const effectiveBatchId = activeBatch?.id ?? "";

  // Academic year for this batch
  const academicYearId = activeBatch?.academic_year_id ?? allAcademicYears[0]?.id ?? "";

  // Filter curricula for selected class & academic year
  const classCurricula = allCurricula.filter(
    c => c.class_id === selectedClassId && (c.academic_year_id === academicYearId || !academicYearId)
  );

  // Filter staff assignments for selected batch
  const batchAssignments = allStaffAssignments.filter(
    a => a.batch_id === effectiveBatchId && a.active !== false
  );

  // Determine subjects present in this class & batch (either through curriculum, assignment, or catalogue)
  const classSubjectIds = new Set([
    ...classCurricula.map(c => String(c.subject_id)),
    ...batchAssignments.map(a => String(a.subject_id))
  ]);

  const activeSubjects = allSubjects.filter(s => classSubjectIds.has(s.id));
  const availableOtherSubjects = allSubjects.filter(s => !classSubjectIds.has(s.id));

  // Selected subject
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const effectiveSubjectId = (activeSubjects.some(s => s.id === selectedSubjectId) ? selectedSubjectId : activeSubjects[0]?.id) ?? "";
  const currentSubject = allSubjects.find(s => s.id === effectiveSubjectId);

  // Active curriculum record for the selected subject + class + year
  const currentCurriculum = classCurricula.find(c => c.subject_id === effectiveSubjectId);

  // Active subject's chapters
  const currentChapters = allChapters
    .filter(c => c.syllabus_id === currentCurriculum?.id)
    .sort((a, b) => Number(a.position ?? 1) - Number(b.position ?? 1));

  // Expanded chapter tracking
  const [expandedChapters, setExpandedChapters] = useState<Record<string, boolean>>({});

  // Modals state
  const [modalType, setModalType] = useState<"chapter" | "topic" | "subtopic" | "subject" | "delete" | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [parentContext, setParentContext] = useState<{ chapterId?: string; topicId?: string; subjectId?: string }>({});
  const [notice, setNotice] = useState<{ error?: string; success?: string }>({});
  const [busy, setBusy] = useState(false);

  // Form states for modals
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formMinutes, setFormMinutes] = useState(45);
  const [formWeight, setFormWeight] = useState(1);
  const [formPosition, setFormPosition] = useState(1);

  function openAddChapter() {
    setModalType("chapter");
    setEditingItem(null);
    setFormName("");
    setFormPosition(currentChapters.length + 1);
  }

  function openEditChapter(chap: Item) {
    setModalType("chapter");
    setEditingItem(chap);
    setFormName(String(chap.name ?? ""));
    setFormPosition(Number(chap.position ?? 1));
  }

  function openAddTopic(chapterId: string) {
    setModalType("topic");
    setEditingItem(null);
    setParentContext({ chapterId });
    setFormName("");
    setFormDesc("");
    setFormMinutes(45);
    setFormWeight(1);
  }

  function openEditTopic(topic: Item) {
    setModalType("topic");
    setEditingItem(topic);
    setParentContext({ chapterId: String(topic.chapter_id) });
    setFormName(String(topic.name ?? ""));
    setFormDesc(String(topic.description ?? ""));
    setFormMinutes(Number(topic.estimated_minutes ?? 45));
    setFormWeight(Number(topic.weight ?? 1));
  }

  function openAddSubtopic(topicId: string) {
    setModalType("subtopic");
    setEditingItem(null);
    setParentContext({ topicId });
    setFormName("");
    setFormDesc("");
    setFormMinutes(15);
  }

  function openEditSubtopic(sub: Item) {
    setModalType("subtopic");
    setEditingItem(sub);
    setParentContext({ topicId: String(sub.topic_id) });
    setFormName(String(sub.name ?? ""));
    setFormDesc(String(sub.description ?? ""));
    setFormMinutes(Number(sub.estimated_minutes ?? 15));
  }

  function openAddSubject() {
    setModalType("subject");
    setFormName("");
    setFormDesc("");
  }

  function confirmDelete(item: Item, moduleType: "chapters" | "topics" | "subtopics" | "subjects") {
    setModalType("delete");
    setEditingItem(item);
    setParentContext({ subjectId: moduleType });
  }

  // Ensure curriculum exists when adding chapters
  async function ensureCurriculum(): Promise<string> {
    if (currentCurriculum?.id) return currentCurriculum.id;
    const curriculumId = crypto.randomUUID();
    const subName = currentSubject?.name ?? "Subject";
    const clsName = rowName(data, "classes", selectedClassId);
    await run({
      operation: "save",
      module: "curricula",
      id: curriculumId,
      create: true,
      values: {
        name: `${subName} Curriculum - ${clsName}`,
        academic_year_id: academicYearId,
        class_id: selectedClassId,
        subject_id: effectiveSubjectId
      }
    });
    return curriculumId;
  }

  async function handleSaveChapter(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setBusy(true);
    setNotice({});
    try {
      const syllabusId = await ensureCurriculum();
      const id = editingItem?.id ?? crypto.randomUUID();
      await run({
        operation: "save",
        module: "chapters",
        id,
        create: !editingItem,
        values: {
          name: formName.trim(),
          syllabus_id: syllabusId,
          position: formPosition
        }
      });
      setModalType(null);
      setNotice({ success: editingItem ? "Chapter updated." : "Chapter created successfully." });
      setExpandedChapters(prev => ({ ...prev, [id]: true }));
    } catch (err) {
      setNotice({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !parentContext.chapterId) return;
    setBusy(true);
    setNotice({});
    try {
      const id = editingItem?.id ?? crypto.randomUUID();
      await run({
        operation: "save",
        module: "topics",
        id,
        create: !editingItem,
        values: {
          name: formName.trim(),
          chapter_id: parentContext.chapterId,
          description: formDesc.trim() || null,
          estimated_minutes: Number(formMinutes),
          weight: Number(formWeight)
        }
      });
      setModalType(null);
      setNotice({ success: editingItem ? "Topic updated." : "Topic added to chapter." });
    } catch (err) {
      setNotice({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveSubtopic(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim() || !parentContext.topicId) return;
    setBusy(true);
    setNotice({});
    try {
      const id = editingItem?.id ?? crypto.randomUUID();
      await run({
        operation: "save",
        module: "subtopics",
        id,
        create: !editingItem,
        values: {
          name: formName.trim(),
          topic_id: parentContext.topicId,
          description: formDesc.trim() || null,
          estimated_minutes: Number(formMinutes)
        }
      });
      setModalType(null);
      setNotice({ success: editingItem ? "Subtopic updated." : "Subtopic added." });
    } catch (err) {
      setNotice({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSubject(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setBusy(true);
    setNotice({});
    try {
      const subjectId = crypto.randomUUID();
      await run({
        operation: "save",
        module: "subjects",
        id: subjectId,
        create: true,
        values: {
          name: formName.trim(),
          description: formDesc.trim() || null
        }
      });

      // Automatically create curriculum for this class
      if (selectedClassId && academicYearId) {
        const clsName = rowName(data, "classes", selectedClassId);
        await run({
          operation: "save",
          module: "curricula",
          id: crypto.randomUUID(),
          create: true,
          values: {
            name: `${formName.trim()} Curriculum - ${clsName}`,
            academic_year_id: academicYearId,
            class_id: selectedClassId,
            subject_id: subjectId
          }
        });
      }

      setSelectedSubjectId(subjectId);
      setModalType(null);
      setNotice({ success: `Subject "${formName.trim()}" added and configured for this class.` });
    } catch (err) {
      setNotice({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleEnableExistingSubject(subjectId: string) {
    setBusy(true);
    setNotice({});
    try {
      const sub = allSubjects.find(s => s.id === subjectId);
      const clsName = rowName(data, "classes", selectedClassId);
      await run({
        operation: "save",
        module: "curricula",
        id: crypto.randomUUID(),
        create: true,
        values: {
          name: `${sub?.name ?? "Subject"} Curriculum - ${clsName}`,
          academic_year_id: academicYearId,
          class_id: selectedClassId,
          subject_id: subjectId
        }
      });
      setSelectedSubjectId(subjectId);
      setNotice({ success: `Subject "${sub?.name}" is now enabled for this class.` });
    } catch (err) {
      setNotice({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteItem() {
    if (!editingItem || !parentContext.subjectId) return;
    setBusy(true);
    setNotice({});
    try {
      await run({
        operation: "delete",
        module: parentContext.subjectId,
        id: editingItem.id
      });
      setModalType(null);
      setNotice({ success: "Item deleted successfully." });
    } catch (err) {
      setNotice({ error: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function toggleChapter(id: string) {
    setExpandedChapters(prev => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id]
    }));
  }

  return (
    <div className="subjects-syllabus-view">
      <PageHeading
        title="Subjects & Syllabus"
        detail="Select a class and batch to view subjects, manage chapters, and structure curriculum topics and subtopics."
      >
        {admin && (
          <button className="button button-primary" onClick={openAddSubject}>
            <Plus size={16} /> Add subject
          </button>
        )}
      </PageHeading>

      {notice.error && <Notice type="error">{notice.error}</Notice>}
      {notice.success && <Notice type="success">{notice.success}</Notice>}

      {/* Control Bar: Class & Batch Selectors */}
      <section className="panel padded-panel subject-control-panel">
        <div className="subject-control-grid">
          <label className="subject-select-label">
            <span className="subject-select-title">
              <GraduationCap size={16} /> Select Class
            </span>
            <select
              value={selectedClassId}
              onChange={e => {
                const newClass = e.target.value;
                setSelectedClassId(newClass);
                const firstB = allBatches.find(b => b.class_id === newClass);
                setSelectedBatchId(firstB?.id ?? "");
              }}
            >
              {classes.map(c => (
                <option key={c.id} value={c.id}>
                  {String(c.name)}
                </option>
              ))}
            </select>
          </label>

          <label className="subject-select-label">
            <span className="subject-select-title">
              <UsersRound size={16} /> Select Batch
            </span>
            <select
              value={effectiveBatchId}
              onChange={e => setSelectedBatchId(e.target.value)}
              disabled={classBatches.length === 0}
            >
              {classBatches.length === 0 ? (
                <option value="">No batches for this class</option>
              ) : (
                classBatches.map(b => (
                  <option key={b.id} value={b.id}>
                    {String(b.name)}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="subject-info-badge">
            <small>Academic Year</small>
            <strong>{rowName(data, "academic_years", academicYearId) || "Current Year"}</strong>
          </div>
        </div>
      </section>

      {/* Main Grid: Subjects on Left, Chapter/Topic Syllabus Tree on Right */}
      <div className="subject-syllabus-grid">
        {/* Left Column: Subjects for Selected Class & Batch */}
        <div className="subject-column">
          <div className="panel-head">
            <div>
              <h3>Subjects</h3>
              <p>
                {rowName(data, "classes", selectedClassId)} · {rowName(data, "batches", effectiveBatchId)}
              </p>
            </div>
            {admin && (
              <button className="button button-ghost button-small" onClick={openAddSubject} title="Create new subject">
                <Plus size={16} />
              </button>
            )}
          </div>

          <div className="subject-card-list">
            {activeSubjects.length === 0 ? (
              <div className="empty-subject-box">
                <BookOpen size={24} className="muted-icon" />
                <p>No subjects linked to this class yet.</p>
                {admin && (
                  <button className="button button-secondary button-small" onClick={openAddSubject}>
                    <Plus size={14} /> Add first subject
                  </button>
                )}
              </div>
            ) : (
              activeSubjects.map(sub => {
                const isSelected = sub.id === effectiveSubjectId;
                const assignment = batchAssignments.find(a => a.subject_id === sub.id);
                const teacherName = assignment ? rowName(data, "staff", String(assignment.staff_id)) : "Unassigned";
                const subCurriculum = classCurricula.find(c => c.subject_id === sub.id);
                const chaps = allChapters.filter(c => c.syllabus_id === subCurriculum?.id);
                const chapIds = new Set(chaps.map(c => c.id));
                const topCount = allTopics.filter(t => chapIds.has(String(t.chapter_id))).length;

                return (
                  <div
                    key={sub.id}
                    className={`subject-card ${isSelected ? "active" : ""}`}
                    onClick={() => setSelectedSubjectId(sub.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="subject-card-header">
                      <div className="subject-badge-icon">
                        <BookOpen size={18} />
                      </div>
                      <div className="subject-card-titles">
                        <strong>{String(sub.name)}</strong>
                        <small className="subject-teacher-info">
                          <UserRound size={12} /> {teacherName}
                        </small>
                      </div>
                      <ChevronRight size={16} className="subject-card-chevron" />
                    </div>
                    <div className="subject-card-meta">
                      <span>{chaps.length} {chaps.length === 1 ? "Chapter" : "Chapters"}</span>
                      <span>•</span>
                      <span>{topCount} {topCount === 1 ? "Topic" : "Topics"}</span>
                    </div>
                  </div>
                );
              })
            )}

            {/* Other Available Subjects (can be enabled with 1-click) */}
            {admin && availableOtherSubjects.length > 0 && (
              <div className="other-subjects-box">
                <div className="other-subjects-title">
                  <small>Available In Catalogue</small>
                </div>
                <div className="other-subjects-list">
                  {availableOtherSubjects.map(sub => (
                    <div key={sub.id} className="other-subject-item">
                      <span>{String(sub.name)}</span>
                      <button
                        className="button button-ghost button-small"
                        onClick={() => handleEnableExistingSubject(sub.id)}
                        disabled={busy}
                        title="Add to this class curriculum"
                      >
                        <Plus size={14} /> Add
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Chapters -> Topics -> Subtopics Workspace */}
        <div className="syllabus-column">
          {currentSubject ? (
            <div className="panel padded-panel syllabus-detail-panel">
              <div className="panel-head syllabus-detail-head">
                <div>
                  <span className="role-tag">Syllabus Structure</span>
                  <h2>{String(currentSubject.name)}</h2>
                  <p>
                    Curriculum outline for {rowName(data, "classes", selectedClassId)} ({rowName(data, "batches", effectiveBatchId)})
                  </p>
                </div>
                <div className="syllabus-head-actions">
                  {admin && (
                    <button className="button button-primary" onClick={openAddChapter}>
                      <Plus size={16} /> Add chapter
                    </button>
                  )}
                </div>
              </div>

              {/* Chapters List */}
              <div className="chapter-hierarchy">
                {currentChapters.length === 0 ? (
                  <div className="empty-chapter-state">
                    <FolderPlus size={36} className="empty-state-icon" />
                    <h3>No chapters defined yet</h3>
                    <p>Start organizing the syllabus for {String(currentSubject.name)} by creating Chapter 1.</p>
                    {admin && (
                      <button className="button button-primary" onClick={openAddChapter}>
                        <Plus size={16} /> Create Chapter 1
                      </button>
                    )}
                  </div>
                ) : (
                  currentChapters.map(chapter => {
                    const isOpen = expandedChapters[chapter.id] !== false; // open by default
                    const chapterTopics = allTopics.filter(t => t.chapter_id === chapter.id);

                    return (
                      <div key={chapter.id} className={`chapter-card ${isOpen ? "open" : ""}`}>
                        {/* Chapter Header Bar */}
                        <div className="chapter-header" onClick={() => toggleChapter(chapter.id)}>
                          <div className="chapter-title-group">
                            <button className="chapter-toggle-btn" aria-label="Toggle chapter view">
                              {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </button>
                            <span className="chapter-pill">Chapter {String(chapter.position ?? 1)}</span>
                            <strong className="chapter-name">{String(chapter.name)}</strong>
                          </div>

                          <div className="chapter-actions-group" onClick={e => e.stopPropagation()}>
                            <span className="chapter-count-badge">
                              {chapterTopics.length} {chapterTopics.length === 1 ? "topic" : "topics"}
                            </span>
                            {admin && (
                              <>
                                <button
                                  className="button button-secondary button-small"
                                  onClick={() => openAddTopic(chapter.id)}
                                >
                                  <Plus size={14} /> Add topic
                                </button>
                                <button
                                  className="icon-action-btn"
                                  onClick={() => openEditChapter(chapter)}
                                  title="Edit chapter"
                                >
                                  <Edit2 size={15} />
                                </button>
                                <button
                                  className="icon-action-btn delete"
                                  onClick={() => confirmDelete(chapter, "chapters")}
                                  title="Delete chapter"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Chapter Content: Topics and Subtopics */}
                        {isOpen && (
                          <div className="chapter-body">
                            {chapterTopics.length === 0 ? (
                              <div className="empty-topic-banner">
                                <p>No topics added to Chapter {String(chapter.position ?? 1)} yet.</p>
                                {admin && (
                                  <button
                                    className="button button-secondary button-small"
                                    onClick={() => openAddTopic(chapter.id)}
                                  >
                                    <Plus size={14} /> Add first topic
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="topic-list">
                                {chapterTopics.map(topic => {
                                  const topicSubtopics = allSubtopics.filter(s => s.topic_id === topic.id);

                                  return (
                                    <div key={topic.id} className="topic-item-card">
                                      {/* Topic Main Row */}
                                      <div className="topic-header-row">
                                        <div className="topic-info">
                                          <div className="topic-name-wrap">
                                            <span className="topic-bullet-dot" />
                                            <strong className="topic-name">{String(topic.name)}</strong>
                                          </div>
                                          {Boolean(topic.description) && (
                                            <p className="topic-description">{String(topic.description)}</p>
                                          )}
                                          <div className="topic-meta-row">
                                            <span>
                                              <Clock size={12} /> {String(topic.estimated_minutes ?? 45)} mins
                                            </span>
                                            <span>•</span>
                                            <span>Weight: {String(topic.weight ?? 1)}</span>
                                            {topicSubtopics.length > 0 && (
                                              <>
                                                <span>•</span>
                                                <span>
                                                  {topicSubtopics.length} {topicSubtopics.length === 1 ? "subtopic" : "subtopics"}
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        </div>

                                        {admin && (
                                          <div className="topic-actions">
                                            <button
                                              className="button button-ghost button-small"
                                              onClick={() => openAddSubtopic(topic.id)}
                                              title="Add subtopic"
                                            >
                                              <Plus size={13} /> Subtopic
                                            </button>
                                            <button
                                              className="icon-action-btn"
                                              onClick={() => openEditTopic(topic)}
                                              title="Edit topic"
                                            >
                                              <Edit2 size={14} />
                                            </button>
                                            <button
                                              className="icon-action-btn delete"
                                              onClick={() => confirmDelete(topic, "topics")}
                                              title="Delete topic"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        )}
                                      </div>

                                      {/* Nested Subtopics */}
                                      {topicSubtopics.length > 0 && (
                                        <div className="subtopic-nested-list">
                                          {topicSubtopics.map(sub => (
                                            <div key={sub.id} className="subtopic-row">
                                              <div className="subtopic-info">
                                                <span className="subtopic-arrow">↳</span>
                                                <span className="subtopic-name">{String(sub.name)}</span>
                                                <small className="subtopic-time">
                                                  ({String(sub.estimated_minutes ?? 15)}m)
                                                </small>
                                                {Boolean(sub.description) && (
                                                  <small className="subtopic-desc">
                                                    · {String(sub.description)}
                                                  </small>
                                                )}
                                              </div>
                                              {admin && (
                                                <div className="subtopic-actions">
                                                  <button
                                                    className="icon-action-btn-tiny"
                                                    onClick={() => openEditSubtopic(sub)}
                                                    title="Edit subtopic"
                                                  >
                                                    <Edit2 size={12} />
                                                  </button>
                                                  <button
                                                    className="icon-action-btn-tiny delete"
                                                    onClick={() => confirmDelete(sub, "subtopics")}
                                                    title="Delete subtopic"
                                                  >
                                                    <Trash2 size={12} />
                                                  </button>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="panel padded-panel empty-selection-panel">
              <Empty
                title="Select a subject"
                text="Choose a subject from the left panel to review or manage its chapters, topics, and subtopics."
              />
            </div>
          )}
        </div>
      </div>

      {/* ===================== MODALS ===================== */}

      {/* Chapter Modal */}
      {modalType === "chapter" && (
        <Modal
          title={editingItem ? "Edit Chapter" : "Add Chapter"}
          close={() => setModalType(null)}
        >
          <form onSubmit={handleSaveChapter} className="record-form">
            <div className="form-grid">
              <label>
                <span>Chapter Name *</span>
                <input
                  type="text"
                  placeholder="e.g. Chapter 1: Introduction to Algebra"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label>
                <span>Chapter Position / Order *</span>
                <input
                  type="number"
                  min={1}
                  value={formPosition}
                  onChange={e => setFormPosition(Number(e.target.value))}
                  required
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="button button-secondary" type="button" onClick={() => setModalType(null)}>
                Cancel
              </button>
              <button className="button button-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save Chapter"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Topic Modal */}
      {modalType === "topic" && (
        <Modal
          title={editingItem ? "Edit Topic" : "Add Topic"}
          close={() => setModalType(null)}
        >
          <form onSubmit={handleSaveTopic} className="record-form">
            <div className="form-grid">
              <label>
                <span>Topic Name *</span>
                <input
                  type="text"
                  placeholder="e.g. Solving Linear Equations"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label>
                <span>Description (Optional)</span>
                <textarea
                  placeholder="Teaching objectives or syllabus details"
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                />
              </label>

              <label>
                <span>Estimated Minutes *</span>
                <input
                  type="number"
                  min={1}
                  value={formMinutes}
                  onChange={e => setFormMinutes(Number(e.target.value))}
                  required
                />
              </label>

              <label>
                <span>Topic Weight *</span>
                <input
                  type="number"
                  min={1}
                  value={formWeight}
                  onChange={e => setFormWeight(Number(e.target.value))}
                  required
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="button button-secondary" type="button" onClick={() => setModalType(null)}>
                Cancel
              </button>
              <button className="button button-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save Topic"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Subtopic Modal */}
      {modalType === "subtopic" && (
        <Modal
          title={editingItem ? "Edit Subtopic" : "Add Subtopic"}
          close={() => setModalType(null)}
        >
          <form onSubmit={handleSaveSubtopic} className="record-form">
            <div className="form-grid">
              <label>
                <span>Subtopic Name *</span>
                <input
                  type="text"
                  placeholder="e.g. Variables and Constants on Both Sides"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label>
                <span>Description (Optional)</span>
                <textarea
                  placeholder="Specific skill or practice focus"
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                />
              </label>

              <label>
                <span>Estimated Minutes *</span>
                <input
                  type="number"
                  min={1}
                  value={formMinutes}
                  onChange={e => setFormMinutes(Number(e.target.value))}
                  required
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="button button-secondary" type="button" onClick={() => setModalType(null)}>
                Cancel
              </button>
              <button className="button button-primary" type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save Subtopic"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create Subject Modal */}
      {modalType === "subject" && (
        <Modal
          title="Add New Subject"
          close={() => setModalType(null)}
        >
          <form onSubmit={handleCreateSubject} className="record-form">
            <div className="form-grid">
              <label>
                <span>Subject Name *</span>
                <input
                  type="text"
                  placeholder="e.g. Physics, Economics, Geography"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                  autoFocus
                />
              </label>

              <label>
                <span>Description (Optional)</span>
                <textarea
                  placeholder="Course goals or description"
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                />
              </label>
            </div>

            <div className="form-actions">
              <button className="button button-secondary" type="button" onClick={() => setModalType(null)}>
                Cancel
              </button>
              <button className="button button-primary" type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create & Add to Class"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {modalType === "delete" && editingItem && (
        <Modal
          title="Confirm Deletion"
          close={() => setModalType(null)}
        >
          <div className="delete-confirm-box">
            <p>
              Are you sure you want to delete <strong>{String(editingItem.name)}</strong>?
            </p>
            {parentContext.subjectId === "chapters" && (
              <small style={{ color: "#b91c1c", display: "block", marginTop: 8 }}>
                Warning: All topics and subtopics inside this chapter will also be removed.
              </small>
            )}
            {parentContext.subjectId === "topics" && (
              <small style={{ color: "#b91c1c", display: "block", marginTop: 8 }}>
                Warning: All subtopics inside this topic will also be removed.
              </small>
            )}
            <div className="form-actions" style={{ marginTop: 20 }}>
              <button className="button button-secondary" type="button" onClick={() => setModalType(null)}>
                Cancel
              </button>
              <button
                className="button button-primary"
                style={{ background: "#dc2626", borderColor: "#dc2626" }}
                onClick={handleDeleteItem}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
