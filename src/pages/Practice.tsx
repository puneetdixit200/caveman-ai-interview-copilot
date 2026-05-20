import { BrainCircuit, CheckCircle2, Clipboard, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/common/Button";
import {
  buildPracticeScoringPrompt,
  listPracticeQuestions,
  nextPracticeState,
  scorePracticeAnswer,
  type PracticeQuestion,
  type PracticeState
} from "../lib/practice";
import type { InterviewType } from "../types/session";

const interviewTypes: Array<{ id: InterviewType; label: string }> = [
  { id: "system_design", label: "System Design" },
  { id: "dsa", label: "DSA" },
  { id: "behavioral", label: "Behavioral" },
  { id: "hr", label: "HR" },
  { id: "mixed", label: "Mixed" }
];

export function Practice() {
  const [interviewType, setInterviewType] = useState<InterviewType>("system_design");
  const questions = useMemo(() => listPracticeQuestions(interviewType), [interviewType]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const activeQuestion = questions[questionIndex % questions.length];
  const [state, setState] = useState<PracticeState>(() => createState(activeQuestion));
  const [draftAnswer, setDraftAnswer] = useState("");
  const [status, setStatus] = useState("Ready for practice");
  const feedback = state.status === "scored" ? scorePracticeAnswer({ question: activeQuestion, answer: state.answer }) : null;

  function changeInterviewType(nextType: InterviewType) {
    const nextQuestions = listPracticeQuestions(nextType);
    setInterviewType(nextType);
    setQuestionIndex(0);
    setState(createState(nextQuestions[0]));
    setDraftAnswer("");
    setStatus("Practice pack loaded");
  }

  function submitAnswer() {
    const answer = draftAnswer.trim();
    if (!answer) {
      setStatus("Write an answer before scoring.");
      return;
    }

    const answered = nextPracticeState(state, { type: "submit_answer", answer });
    const scored = nextPracticeState(answered, {
      type: "apply_score",
      score: scorePracticeAnswer({ question: activeQuestion, answer }).score
    });
    setState(scored);
    setStatus("Answer scored locally");
  }

  function nextQuestion() {
    const nextIndex = (questionIndex + 1) % questions.length;
    const next = questions[nextIndex];
    setQuestionIndex(nextIndex);
    setState(nextPracticeState(state, { type: "next_question", question: next.question }));
    setDraftAnswer("");
    setStatus("Next interviewer question ready");
  }

  async function copyScoringPrompt() {
    await navigator.clipboard?.writeText(
      buildPracticeScoringPrompt({
        interviewType,
        question: activeQuestion.question,
        answer: state.answer || draftAnswer
      })
    );
    setStatus("Scoring prompt copied");
  }

  return (
    <main className="page-column">
      <section className="panel toolbar-panel">
        <div>
          <p className="eyebrow">Practice</p>
          <h1>Interviewer Mode</h1>
          <p className="page-status">{status}</p>
        </div>
        <label className="practice-type-picker">
          <span>Interview type</span>
          <select value={interviewType} onChange={(event) => changeInterviewType(event.currentTarget.value as InterviewType)}>
            {interviewTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="panel practice-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Question {questionIndex + 1}</p>
            <h2>{activeQuestion.question}</h2>
          </div>
          <BrainCircuit size={20} />
        </div>
        <div className="tag-list">
          {activeQuestion.focus.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <label className="practice-answer">
          <span>Your answer</span>
          <textarea
            value={draftAnswer}
            onChange={(event) => setDraftAnswer(event.currentTarget.value)}
            placeholder="Answer out loud, then write your structured version here for scoring..."
          />
        </label>
        <div className="command-actions">
          <Button icon={<CheckCircle2 size={16} />} onClick={submitAnswer}>
            Score Answer
          </Button>
          <Button variant="secondary" icon={<RotateCcw size={16} />} onClick={nextQuestion}>
            Next Question
          </Button>
          <Button variant="secondary" icon={<Clipboard size={16} />} onClick={copyScoringPrompt}>
            Copy LLM Rubric
          </Button>
        </div>
      </section>

      <section className="panel practice-feedback-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Feedback</p>
            <h2>{feedback ? `Score ${feedback.score}/5` : "Not scored yet"}</h2>
          </div>
        </div>
        {feedback ? (
          <div className="practice-feedback">
            <p>{feedback.feedback}</p>
            <strong>{feedback.nextAction}</strong>
            <div className="tag-list">
              {feedback.matchedSignals.map((signal) => (
                <span key={signal}>{signal}</span>
              ))}
            </div>
          </div>
        ) : (
          <p className="empty-copy">Submit an answer to get local scoring and next-step feedback.</p>
        )}
      </section>
    </main>
  );
}

function createState(question: PracticeQuestion): PracticeState {
  return {
    status: "asking",
    question: question.question,
    answer: "",
    score: null
  };
}
