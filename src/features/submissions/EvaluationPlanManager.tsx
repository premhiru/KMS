import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Check,
  Download,
  EyeOff,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  createId,
  downloadCsv,
  nowIso,
  reviewResultsToCsv,
  selectEligibleSubmissionsForRound,
  selectEvaluationRoundProgress,
  selectEvaluationRounds,
  selectNextEvaluationRound,
  selectReviewerProgress,
  selectRoundAssignments,
  selectRoundResults,
  selectRoundSubmissionScore,
  selectSubmissionSpeakers,
  useApp,
} from "../../core";
import type {
  EvaluationAssignment,
  EvaluationPlan,
  EvaluationRound,
  EvaluationRoundStatus,
  Id,
  RubricCriterion,
  SubmissionStatus,
} from "../../domain";
import "./submissions.css";
import { addReviewerToPool, autoDistributeReviewers } from "./evaluation-pools";

const defaultRubric: RubricCriterion[] = [
  { id: "relevance", label: "Relevance", weight: 35, maxScore: 5 },
  { id: "originality", label: "Originality", weight: 25, maxScore: 5 },
  { id: "clarity", label: "Clarity", weight: 20, maxScore: 5 },
  { id: "speaker-fit", label: "Speaker fit", weight: 20, maxScore: 5 },
];

function localDateTime(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export interface EvaluationPlanManagerProps {
  initialPlanId?: Id;
  initialRoundId?: Id;
  onOpenReviewer?: (
    reviewerEmail: string,
    roundId: Id,
    submissionId?: Id,
  ) => void;
}

export function EvaluationPlanManager({
  initialPlanId,
  initialRoundId,
  onOpenReviewer,
}: EvaluationPlanManagerProps) {
  const { state, dispatch } = useApp();
  const plans = state.evaluationPlans ?? [];
  const [planId, setPlanId] = useState(initialPlanId ?? plans[0]?.id ?? "");
  const rounds = selectEvaluationRounds(state, planId);
  const [roundId, setRoundId] = useState(initialRoundId ?? rounds[0]?.id ?? "");
  const selectedPlan = plans.find((plan) => plan.id === planId);
  const selectedRound =
    rounds.find((round) => round.id === roundId) ?? rounds[0];

  function createPlan() {
    const at = nowIso();
    const id = createId("evaluation-plan");
    const firstRoundId = createId("evaluation-round");
    dispatch({
      type: "evaluation/plan/upsert",
      plan: {
        id,
        name: "New evaluation plan",
        instructions: "",
        createdAt: at,
        updatedAt: at,
      },
      at,
    });
    dispatch({
      type: "evaluation/round/upsert",
      round: {
        id: firstRoundId,
        planId: id,
        name: "Round 1",
        position: 1,
        status: "draft",
        dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        blind: false,
        instructions: "",
        rubric: defaultRubric.map((criterion) => ({ ...criterion })),
        createdAt: at,
        updatedAt: at,
      },
      at,
    });
    setPlanId(id);
    setRoundId(firstRoundId);
  }

  function createRound() {
    if (!selectedPlan) return;
    const at = nowIso();
    const id = createId("evaluation-round");
    const position = Math.max(0, ...rounds.map((round) => round.position)) + 1;
    dispatch({
      type: "evaluation/round/upsert",
      round: {
        id,
        planId: selectedPlan.id,
        name: `Round ${position}`,
        position,
        status: "draft",
        dueAt: new Date(Date.now() + position * 7 * 86_400_000).toISOString(),
        blind: false,
        instructions: "",
        rubric: defaultRubric.map((criterion) => ({ ...criterion })),
        createdAt: at,
        updatedAt: at,
      },
      at,
    });
    setRoundId(id);
  }

  return (
    <section
      className="sb-plan-manager"
      aria-labelledby="evaluation-plans-heading"
    >
      <div className="sb-plan-toolbar">
        <div>
          <p className="sb-eyebrow">Evaluation operations</p>
          <h2 id="evaluation-plans-heading">Plans and rounds</h2>
        </div>
        <div>
          <label>
            <span className="sb-sr-only">Evaluation plan</span>
            <select
              value={planId}
              onChange={(event) => {
                setPlanId(event.target.value);
                setRoundId(
                  selectEvaluationRounds(state, event.target.value)[0]?.id ??
                    "",
                );
              }}
            >
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
          </label>
          <button className="sb-button" type="button" onClick={createPlan}>
            <Plus aria-hidden="true" />
            New plan
          </button>
        </div>
      </div>

      {!selectedPlan && (
        <div className="sb-empty">
          <h2>No evaluation plan yet</h2>
          <p>Create a plan to configure reviewer rounds and assignments.</p>
          <button
            className="sb-button sb-button--primary"
            type="button"
            onClick={createPlan}
          >
            Create evaluation plan
          </button>
        </div>
      )}
      {selectedPlan && (
        <>
          <PlanEditor
            key={selectedPlan.id}
            plan={selectedPlan}
            onSave={(plan) =>
              dispatch({ type: "evaluation/plan/upsert", plan, at: nowIso() })
            }
          />
          <div className="sb-plan-layout">
            <aside className="sb-round-list" aria-label="Evaluation rounds">
              {rounds.map((round) => {
                const progress = selectEvaluationRoundProgress(state, round.id);
                return (
                  <button
                    type="button"
                    key={round.id}
                    className={
                      round.id === selectedRound?.id ? "is-selected" : ""
                    }
                    onClick={() => setRoundId(round.id)}
                  >
                    <span>
                      <strong>{round.name}</strong>
                      <small>
                        {round.status} · due{" "}
                        {new Date(round.dueAt).toLocaleDateString()}
                      </small>
                    </span>
                    <b>{progress.percent}%</b>
                  </button>
                );
              })}
              <button
                className="sb-round-list__add"
                type="button"
                onClick={createRound}
              >
                <Plus aria-hidden="true" />
                Add round
              </button>
            </aside>
            <main className="sb-round-main">
              {selectedRound && (
                <>
                  <RoundEditor
                    key={selectedRound.id}
                    round={selectedRound}
                    onOpenReviewer={onOpenReviewer}
                  />
                  <RoundInsights round={selectedRound} />
                </>
              )}
            </main>
          </div>
        </>
      )}
    </section>
  );
}

function PlanEditor({
  plan,
  onSave,
}: {
  plan: EvaluationPlan;
  onSave: (plan: EvaluationPlan) => void;
}) {
  const [name, setName] = useState(plan.name);
  const [instructions, setInstructions] = useState(plan.instructions);
  const [saved, setSaved] = useState(false);
  return (
    <form
      className="sb-plan-header"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          ...plan,
          name: name.trim(),
          instructions: instructions.trim(),
          updatedAt: nowIso(),
        });
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1500);
      }}
    >
      <label>
        Plan name
        <input
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label>
        Committee instructions
        <input
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </label>
      <button className="sb-button" type="submit">
        {saved ? (
          <>
            <Check aria-hidden="true" />
            Saved
          </>
        ) : (
          "Save plan"
        )}
      </button>
    </form>
  );
}

function RoundInsights({ round }: { round: EvaluationRound }) {
  const { state, api, persistenceMode } = useApp();
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [reminderNotice, setReminderNotice] = useState("");
  const [sendingReminders, setSendingReminders] = useState(false);
  const reviewers = selectReviewerProgress(state, round.id);
  const incompleteReviewers = reviewers.filter(
    (reviewer) => reviewer.completed + reviewer.abstained < reviewer.assigned,
  );
  const results = selectRoundResults(state, round.id).sort((left, right) => {
    const score = (left.aggregate ?? -1) - (right.aggregate ?? -1);
    return direction === "asc" ? score : -score;
  });
  async function remindIncompleteReviewers() {
    if (!api || persistenceMode !== "remote") {
      setReminderNotice("Reviewer reminder email is available on the deployed application.");
      return;
    }
    setSendingReminders(true);
    const returnUrl = new URL(window.location.href);
    returnUrl.hash = "#/reviews";
    returnUrl.searchParams.delete("reviewerToken");
    const receipts = await Promise.allSettled(incompleteReviewers.map((reviewer) => api.inviteReviewer({ name: reviewer.reviewerName, email: reviewer.reviewerEmail, returnUrl: returnUrl.toString(), purpose: "reminder", roundId: round.id })));
    const sent = receipts.filter((receipt) => receipt.status === "fulfilled" && receipt.value.status === "sent").length;
    const failed = receipts.length - sent;
    setReminderNotice(`${sent} reviewer reminder email${sent === 1 ? "" : "s"} sent${failed ? `; ${failed} failed` : ""}.`);
    setSendingReminders(false);
  }
  return (
    <div>
      <section
        className="sb-assignment-section"
        aria-labelledby={`reviewer-progress-${round.id}`}
      >
        <div className="sb-card__header">
          <div>
            <h3 id={`reviewer-progress-${round.id}`}>Reviewer progress</h3>
            <p>Completion grouped by reviewer for this round.</p>
          </div>
          <button
            className="sb-button"
            type="button"
            disabled={incompleteReviewers.length === 0 || sendingReminders}
            onClick={() => void remindIncompleteReviewers()}
          >
            {sendingReminders ? "Sending…" : "Email incomplete reviewers"}
          </button>
        </div>
        {reminderNotice && (
          <p className="sb-form-notice" role="status">
            {reminderNotice}
          </p>
        )}
        <div className="sb-assignment-table">
          {reviewers.map((reviewer) => (
            <div key={reviewer.reviewerEmail}>
              <span>
                <strong>{reviewer.reviewerName}</strong>
                <small>{reviewer.reviewerEmail}</small>
              </span>
              <span>
                {reviewer.completed}/{reviewer.assigned} completed ·{" "}
                {reviewer.abstained} abstained
              </span>
              <b>{reviewer.percent}%</b>
            </div>
          ))}
          {reviewers.length === 0 && (
            <p className="sb-muted">No reviewers assigned.</p>
          )}
        </div>
      </section>
      <section
        className="sb-assignment-section"
        aria-labelledby={`round-results-${round.id}`}
      >
        <div className="sb-card__header">
          <div>
            <h3 id={`round-results-${round.id}`}>Round results</h3>
            <p>Weighted aggregate scores across completed reviews.</p>
          </div>
          <div>
            <button
              className="sb-button"
              type="button"
              onClick={() =>
                setDirection((value) => (value === "asc" ? "desc" : "asc"))
              }
            >
              <ArrowDownUp aria-hidden="true" />
              Score {direction === "asc" ? "ascending" : "descending"}
            </button>
            <button
              className="sb-button"
              type="button"
              onClick={() =>
                downloadCsv(
                  `${round.name.replace(/\W+/g, "-").toLowerCase()}-review-scores.csv`,
                  reviewResultsToCsv(state, round.id),
                )
              }
            >
              <Download aria-hidden="true" />
              Export scores
            </button>
          </div>
        </div>
        <div className="sb-assignment-table">
          {results.map((result) => (
            <div key={result.submission.id}>
              <span>
                <strong>{result.submission.title}</strong>
                <small>
                  {result.submission.track} · {result.submission.format}
                </small>
                <small>
                  {selectSubmissionSpeakers(state, result.submission.id)
                    .map(
                      (speaker, index) =>
                        `${speaker.firstName} ${speaker.lastName} (${index === 0 ? "Primary speaker" : "Co-speaker"})`,
                    )
                    .join(" · ")}
                </small>
              </span>
              <span>
                {result.reviewCount} completed review
                {result.reviewCount === 1 ? "" : "s"}
              </span>
              <b>{result.aggregate?.toFixed(2) ?? "—"} / 5</b>
            </div>
          ))}
          {results.length === 0 && (
            <p className="sb-muted">No assigned proposals.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function RoundEditor({
  round,
  onOpenReviewer,
}: {
  round: EvaluationRound;
  onOpenReviewer?: EvaluationPlanManagerProps["onOpenReviewer"];
}) {
  const { state, dispatch, api, persistenceMode } = useApp();
  const [name, setName] = useState(round.name);
  const [status, setStatus] = useState<EvaluationRoundStatus>(round.status);
  const [opensAt, setOpensAt] = useState(
    localDateTime(round.opensAt ?? nowIso()),
  );
  const [dueAt, setDueAt] = useState(localDateTime(round.dueAt));
  const [blind, setBlind] = useState(round.blind);
  const [instructions, setInstructions] = useState(round.instructions);
  const [rubric, setRubric] = useState(round.rubric);
  const [tracks, setTracks] = useState(round.filter?.tracks ?? []);
  const [submissionStatuses, setSubmissionStatuses] = useState<
    SubmissionStatus[]
  >(round.filter?.submissionStatuses ?? ["needs-review", "in-review"]);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [poolName, setPoolName] = useState("");
  const [poolEmail, setPoolEmail] = useState("");
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<Id[]>([]);
  const [advanceIds, setAdvanceIds] = useState<Id[]>([]);
  const [nextReviewerName, setNextReviewerName] = useState("");
  const [nextReviewerEmail, setNextReviewerEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [invitingEmail, setInvitingEmail] = useState("");
  const reviewerPool = round.reviewerPool ?? [];
  const assignments = selectRoundAssignments(state, round.id);
  const progress = selectEvaluationRoundProgress(state, round.id);
  const eligible = useMemo(
    () =>
      selectEligibleSubmissionsForRound(state, {
        ...round,
        filter: { ...round.filter, tracks, submissionStatuses },
      }),
    [round, state, submissionStatuses, tracks],
  );
  const nextRound = selectNextEvaluationRound(state, round.id);
  const roundSubmissionIds = [
    ...new Set(assignments.map((assignment) => assignment.submissionId)),
  ];
  const terminalSubmissionIds = roundSubmissionIds.filter((submissionId) =>
    assignments.some(
      (assignment) =>
        assignment.submissionId === submissionId &&
        (assignment.status === "completed" ||
          assignment.status === "abstained"),
    ),
  );
  const totalWeight = rubric.reduce(
    (sum, criterion) => sum + Math.max(0, criterion.weight),
    0,
  );

  function saveRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !name.trim() ||
      !dueAt ||
      rubric.length === 0 ||
      rubric.some(
        (criterion) =>
          !criterion.label.trim() ||
          criterion.weight <= 0 ||
          criterion.maxScore <= 0,
      )
    )
      return;
    dispatch({
      type: "evaluation/round/upsert",
      round: {
        ...round,
        name: name.trim(),
        status,
        opensAt: new Date(opensAt).toISOString(),
        dueAt: new Date(dueAt).toISOString(),
        blind,
        instructions: instructions.trim(),
        rubric: rubric.map((criterion) => ({
          ...criterion,
          label: criterion.label.trim(),
          options:
            criterion.type === "select"
              ? (criterion.options ?? [])
                  .map((option) => option.trim())
                  .filter(Boolean)
              : undefined,
        })),
        filter: { ...round.filter, tracks, submissionStatuses },
        updatedAt: nowIso(),
      },
      at: nowIso(),
    });
    setNotice("Round configuration saved.");
  }

  function addAssignments(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !reviewerName.trim() ||
      !/^\S+@\S+\.\S+$/.test(reviewerEmail.trim()) ||
      selectedSubmissionIds.length === 0
    )
      return;
    const at = nowIso();
    for (const submissionId of selectedSubmissionIds) {
      const assignment: EvaluationAssignment = {
        id: createId("evaluation-assignment"),
        roundId: round.id,
        submissionId,
        reviewerName: reviewerName.trim(),
        reviewerEmail: reviewerEmail.trim().toLowerCase(),
        status: "assigned",
        assignedAt: at,
        updatedAt: at,
      };
      dispatch({ type: "evaluation/assignment/upsert", assignment, at });
    }
    setSelectedSubmissionIds([]);
    setNotice(
      `${selectedSubmissionIds.length} reviewer assignment${selectedSubmissionIds.length === 1 ? "" : "s"} created.`,
    );
  }

  function addPoolReviewer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!poolName.trim() || !/^\S+@\S+\.\S+$/.test(poolEmail.trim())) return;
    const nextPool = addReviewerToPool(reviewerPool, {
      name: poolName,
      email: poolEmail,
    });
    if (nextPool === reviewerPool) {
      setNotice("That reviewer is already in this round's pool.");
      return;
    }
    const at = nowIso();
    dispatch({
      type: "evaluation/round/upsert",
      round: { ...round, reviewerPool: nextPool, updatedAt: at },
      at,
    });
    setReviewerName(poolName.trim());
    setReviewerEmail(poolEmail.trim().toLowerCase());
    setPoolName("");
    setPoolEmail("");
    setNotice(`Reviewer added to ${round.name} only.`);
  }

  function removePoolReviewer(email: string) {
    const at = nowIso();
    dispatch({
      type: "evaluation/round/upsert",
      round: {
        ...round,
        reviewerPool: reviewerPool.filter(
          (reviewer) => reviewer.email.toLowerCase() !== email.toLowerCase(),
        ),
        updatedAt: at,
      },
      at,
    });
    setNotice(`Reviewer removed from ${round.name}'s pool.`);
  }

  function autoDistribute() {
    const at = nowIso();
    const distributed = autoDistributeReviewers(
      round.id,
      eligible,
      reviewerPool,
      assignments,
      at,
    );
    for (const assignment of distributed)
      dispatch({ type: "evaluation/assignment/upsert", assignment, at });
    setNotice(
      distributed.length
        ? `Auto-distributed ${distributed.length} filtered submission${distributed.length === 1 ? "" : "s"} across ${reviewerPool.length} reviewer${reviewerPool.length === 1 ? "" : "s"}.`
        : "No new filtered assignments were available to distribute.",
    );
  }

  function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !nextRound ||
      !nextReviewerName.trim() ||
      !/^\S+@\S+\.\S+$/.test(nextReviewerEmail.trim()) ||
      advanceIds.length === 0
    )
      return;
    const at = nowIso();
    for (const submissionId of advanceIds) {
      dispatch({
        type: "evaluation/advance",
        advancement: {
          id: createId("evaluation-advancement"),
          planId: round.planId,
          submissionId,
          fromRoundId: round.id,
          toRoundId: nextRound.id,
          advancedAt: at,
        },
        assignments: [
          {
            id: createId("evaluation-assignment"),
            roundId: nextRound.id,
            submissionId,
            reviewerName: nextReviewerName.trim(),
            reviewerEmail: nextReviewerEmail.trim().toLowerCase(),
            status: "assigned",
            assignedAt: at,
            updatedAt: at,
          },
        ],
        at,
      });
    }
    setAdvanceIds([]);
    setNotice(
      `${advanceIds.length} submission${advanceIds.length === 1 ? "" : "s"} advanced to ${nextRound.name}.`,
    );
  }

  function toggle<T extends string>(
    items: T[],
    value: T,
    checked: boolean,
    setter: (items: T[]) => void,
  ) {
    setter(
      checked
        ? [...new Set([...items, value])]
        : items.filter((item) => item !== value),
    );
  }

  async function inviteReviewer(name: string, email: string) {
    if (!api || persistenceMode !== "remote") {
      setNotice("Reviewer invitation email is available on the deployed application.");
      return;
    }
    setInvitingEmail(email);
    try {
      const returnUrl = new URL(window.location.href);
      returnUrl.hash = "#/reviews";
      returnUrl.searchParams.delete("reviewerToken");
      const receipt = await api.inviteReviewer({ name, email, returnUrl: returnUrl.toString() });
      setNotice(`Reviewer invitation sent to ${receipt.email} for ${receipt.assignmentCount} assignment${receipt.assignmentCount === 1 ? "" : "s"}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Reviewer invitation delivery failed.");
    } finally {
      setInvitingEmail("");
    }
  }

  return (
    <div>
      {notice && (
        <p className="sb-form-notice" role="status">
          {notice}
        </p>
      )}
      <div className="sb-round-progress">
        <div>
          <strong>{progress.percent}%</strong>
          <span>
            {progress.terminal} of {progress.total} assignments terminal
          </span>
        </div>
        <div className="sb-progress-track">
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <small>
          {progress.completed} completed · {progress.abstained} abstained ·{" "}
          {progress.inProgress} in progress
        </small>
      </div>
      <form className="sb-round-config sb-form" onSubmit={saveRound}>
        <div className="sb-form__row">
          <label>
            Round name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as EvaluationRoundStatus)
              }
            >
              <option value="draft">Draft</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label>
            Opens
            <input
              required
              type="datetime-local"
              value={opensAt}
              onChange={(event) => setOpensAt(event.target.value)}
            />
          </label>
          <label>
            Closes
            <input
              required
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>
        </div>
        <label>
          Reviewer instructions
          <textarea
            rows={3}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
        <label className="sb-check">
          <input
            type="checkbox"
            checked={blind}
            onChange={(event) => setBlind(event.target.checked)}
          />
          <span>
            <strong>Blind review</strong>
            <small>Hide attached speaker identity from reviewer queues.</small>
          </span>
          <EyeOff aria-hidden="true" />
        </label>
        <fieldset className="sb-filter-fieldset">
          <legend>Submission filters</legend>
          <div>
            <strong>Tracks</strong>
            {state.event.tracks.map((track) => (
              <label key={track}>
                <input
                  type="checkbox"
                  checked={tracks.includes(track)}
                  onChange={(event) =>
                    toggle(tracks, track, event.target.checked, setTracks)
                  }
                />
                {track}
              </label>
            ))}
          </div>
          <div>
            <strong>Statuses</strong>
            {(
              [
                "needs-review",
                "in-review",
                "accepted",
                "waitlisted",
              ] as SubmissionStatus[]
            ).map((item) => (
              <label key={item}>
                <input
                  type="checkbox"
                  checked={submissionStatuses.includes(item)}
                  onChange={(event) =>
                    toggle(
                      submissionStatuses,
                      item,
                      event.target.checked,
                      setSubmissionStatuses,
                    )
                  }
                />
                {item.replace("-", " ")}
              </label>
            ))}
          </div>
        </fieldset>
        <section className="sb-rubric" aria-labelledby={`rubric-${round.id}`}>
          <div className="sb-card__header">
            <div>
              <h3 id={`rubric-${round.id}`}>Weighted rubric</h3>
              <p>
                Weights are normalized automatically. Current total:{" "}
                {totalWeight}.
              </p>
            </div>
            <button
              className="sb-button"
              type="button"
              onClick={() =>
                setRubric((items) => [
                  ...items,
                  {
                    id: createId("criterion"),
                    label: "New criterion",
                    type: "rating",
                    required: true,
                    weight: 10,
                    maxScore: 5,
                  },
                ])
              }
            >
              <Plus aria-hidden="true" />
              Criterion
            </button>
          </div>
          {rubric.map((criterion) => (
            <div className="sb-rubric-row" key={criterion.id}>
              <label>
                Criterion
                <input
                  required
                  value={criterion.label}
                  onChange={(event) =>
                    setRubric((items) =>
                      items.map((item) =>
                        item.id === criterion.id
                          ? { ...item, label: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Answer type
                <select
                  value={criterion.type ?? "rating"}
                  onChange={(event) =>
                    setRubric((items) =>
                      items.map((item) =>
                        item.id === criterion.id
                          ? {
                              ...item,
                              type: event.target
                                .value as RubricCriterion["type"],
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="rating">Numeric rating</option>
                  <option value="select">Dropdown</option>
                  <option value="text">Free text</option>
                </select>
              </label>
              <label>
                Weight
                <input
                  required
                  min="1"
                  max="100"
                  type="number"
                  value={criterion.weight}
                  onChange={(event) =>
                    setRubric((items) =>
                      items.map((item) =>
                        item.id === criterion.id
                          ? { ...item, weight: Number(event.target.value) }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              {(criterion.type ?? "rating") === "rating" && (
                <label>
                  Scale
                  <input
                    required
                    min="2"
                    max="20"
                    type="number"
                    value={criterion.maxScore}
                    onChange={(event) =>
                      setRubric((items) =>
                        items.map((item) =>
                          item.id === criterion.id
                            ? { ...item, maxScore: Number(event.target.value) }
                            : item,
                        ),
                      )
                    }
                  />
                </label>
              )}
              {criterion.type === "select" && (
                <label>
                  Options
                  <input
                    required
                    value={(criterion.options ?? []).join(", ")}
                    onChange={(event) =>
                      setRubric((items) =>
                        items.map((item) =>
                          item.id === criterion.id
                            ? {
                                ...item,
                                options: event.target.value.split(","),
                              }
                            : item,
                        ),
                      )
                    }
                    placeholder="Strong accept, Accept, Reject"
                  />
                </label>
              )}
              <label className="sb-check">
                <input
                  type="checkbox"
                  checked={criterion.required !== false}
                  onChange={(event) =>
                    setRubric((items) =>
                      items.map((item) =>
                        item.id === criterion.id
                          ? { ...item, required: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />
                Required
              </label>
              <button
                className="sb-icon-button sb-icon-button--danger"
                type="button"
                aria-label={`Delete ${criterion.label}`}
                onClick={() =>
                  setRubric((items) =>
                    items.filter((item) => item.id !== criterion.id),
                  )
                }
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
        </section>
        <button className="sb-button sb-button--primary" type="submit">
          Save round
        </button>
      </form>

      <section className="sb-assignment-section" aria-labelledby={`reviewer-pool-${round.id}`}>
        <div className="sb-card__header">
          <div>
            <h3 id={`reviewer-pool-${round.id}`}>{round.name} reviewer pool</h3>
            <p>This pool belongs only to this round. Other rounds keep independent reviewer lists.</p>
          </div>
          <button
            className="sb-button"
            type="button"
            disabled={reviewerPool.length === 0 || eligible.length === 0}
            onClick={autoDistribute}
          >
            Auto-distribute filtered submissions
          </button>
        </div>
        <form onSubmit={addPoolReviewer}>
          <div className="sb-form__row sb-form__row--two">
            <label>
              Reviewer name
              <input required value={poolName} onChange={(event) => setPoolName(event.target.value)} />
            </label>
            <label>
              Reviewer email
              <input required type="email" value={poolEmail} onChange={(event) => setPoolEmail(event.target.value)} />
            </label>
          </div>
          <button className="sb-button" type="submit"><UserPlus aria-hidden="true" />Add to this round</button>
        </form>
        <div className="sb-assignment-table">
          {reviewerPool.map((reviewer) => (
            <div key={reviewer.email}>
              <span><strong>{reviewer.name}</strong><small>{reviewer.email}</small></span>
              <span>Eligible for {round.name}</span>
              <button className="sb-button" type="button" onClick={() => { setReviewerName(reviewer.name); setReviewerEmail(reviewer.email); }}>Use for manual assignment</button>
              <button className="sb-icon-button sb-icon-button--danger" type="button" aria-label={`Remove ${reviewer.name} from ${round.name}`} onClick={() => removePoolReviewer(reviewer.email)}><Trash2 aria-hidden="true" /></button>
            </div>
          ))}
          {reviewerPool.length === 0 && <p className="sb-muted">No reviewers in this round's pool.</p>}
        </div>
      </section>

      <section className="sb-assignment-section">
        <div className="sb-card__header">
          <div>
            <h3>Reviewer assignments</h3>
            <p>Only assigned submissions appear in a reviewer’s queue.</p>
          </div>
        </div>
        <form onSubmit={addAssignments}>
          <div className="sb-form__row sb-form__row--two">
            <label>
              Reviewer name
              <input
                required
                value={reviewerName}
                onChange={(event) => setReviewerName(event.target.value)}
              />
            </label>
            <label>
              Reviewer email
              <input
                required
                type="email"
                value={reviewerEmail}
                onChange={(event) => setReviewerEmail(event.target.value)}
              />
            </label>
          </div>
          <div className="sb-assignment-picker">
            {eligible.map((submission) => (
              <label key={submission.id}>
                <input
                  type="checkbox"
                  checked={selectedSubmissionIds.includes(submission.id)}
                  onChange={(event) =>
                    toggle(
                      selectedSubmissionIds,
                      submission.id,
                      event.target.checked,
                      setSelectedSubmissionIds,
                    )
                  }
                />
                <span>
                  <strong>{submission.title}</strong>
                  <small>
                    {submission.track} · {submission.format}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <button className="sb-button" type="submit">
            <UserPlus aria-hidden="true" />
            Assign selected
          </button>
        </form>
        <div className="sb-assignment-table">
          {assignments.map((assignment) => (
            <div key={assignment.id}>
              <span>
                <strong>{assignment.reviewerName}</strong>
                <small>{assignment.reviewerEmail}</small>
              </span>
              <span>
                {
                  state.submissions.find(
                    (item) => item.id === assignment.submissionId,
                  )?.title
                }
              </span>
              <b
                className={`sb-badge sb-badge--${assignment.status === "completed" ? "accepted" : assignment.status === "abstained" ? "declined" : "in-review"}`}
              >
                {assignment.status}
              </b>
              {onOpenReviewer && (
                <button
                  className="sb-button"
                  type="button"
                  onClick={() =>
                    onOpenReviewer(
                      assignment.reviewerEmail,
                      round.id,
                      assignment.submissionId,
                    )
                  }
                >
                  Open queue
                </button>
              )}
              <button
                className="sb-button"
                type="button"
                disabled={invitingEmail === assignment.reviewerEmail}
                onClick={() => void inviteReviewer(assignment.reviewerName, assignment.reviewerEmail)}
              >
                {invitingEmail === assignment.reviewerEmail ? "Sending…" : "Send invite / reminder"}
              </button>
              <button
                className="sb-icon-button sb-icon-button--danger"
                type="button"
                aria-label={`Delete assignment for ${assignment.reviewerName}`}
                onClick={() =>
                  dispatch({
                    type: "evaluation/assignment/delete",
                    id: assignment.id,
                    at: nowIso(),
                  })
                }
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {nextRound && (
        <section className="sb-advancement">
          <div className="sb-card__header">
            <div>
              <h3>Advance to {nextRound.name}</h3>
              <p>
                Promotion is idempotent; repeating it will not duplicate the
                reviewer assignment.
              </p>
            </div>
            <ArrowRight aria-hidden="true" />
          </div>
          <form onSubmit={advance}>
            <div className="sb-form__row sb-form__row--two">
              <label>
                Next-round reviewer name
                <input
                  required
                  value={nextReviewerName}
                  onChange={(event) => setNextReviewerName(event.target.value)}
                />
              </label>
              <label>
                Reviewer email
                <input
                  required
                  type="email"
                  value={nextReviewerEmail}
                  onChange={(event) => setNextReviewerEmail(event.target.value)}
                />
              </label>
            </div>
            <div className="sb-assignment-picker">
              {terminalSubmissionIds.map((submissionId) => {
                const submission = state.submissions.find(
                  (item) => item.id === submissionId,
                );
                if (!submission) return null;
                return (
                  <label key={submission.id}>
                    <input
                      type="checkbox"
                      checked={advanceIds.includes(submission.id)}
                      onChange={(event) =>
                        toggle(
                          advanceIds,
                          submission.id,
                          event.target.checked,
                          setAdvanceIds,
                        )
                      }
                    />
                    <span>
                      <strong>{submission.title}</strong>
                      <small>
                        Weighted score{" "}
                        {selectRoundSubmissionScore(
                          state,
                          round.id,
                          submission.id,
                        )?.toFixed(2) ?? "—"}{" "}
                        / 5
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
            <button className="sb-button sb-button--primary" type="submit">
              Advance selected <ArrowRight aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
