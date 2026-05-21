import { Bot, BrainCircuit, CheckCircle2, Clipboard, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/common/Button";
import {
  APP_CONFIG_SETTING_KEY,
  DEFAULT_APP_CONFIG,
  parseAppConfig,
  type AppConfig
} from "../lib/appConfig";
import {
  PLUGIN_CATALOG_SETTING_KEY,
  createEmptyPluginCatalog,
  parsePluginCatalog,
  type PluginCatalog
} from "../lib/pluginLoader";
import {
  buildPracticeFollowUpMessages,
  buildPracticeScoringPrompt,
  listPluginPracticeQuestions,
  listPracticeQuestions,
  nextPracticeState,
  scorePracticeAnswer,
  type PracticeQuestion,
  type PracticeState
} from "../lib/practice";
import { createConfiguredProvider } from "../lib/providerClients";
import { ProviderRouter } from "../lib/providerRouter";
import { hydrateProviderApiKeys } from "../lib/providerSecrets";
import { selectRunnableProviders } from "../lib/providerSelection";
import { getSetting } from "../lib/tauri";
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
  const [pluginCatalog, setPluginCatalog] = useState<PluginCatalog>(createEmptyPluginCatalog());
  const [appConfig, setAppConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [practicePackId, setPracticePackId] = useState("built-in");
  const pluginPracticePacks = useMemo(
    () =>
      pluginCatalog.practicePacks.filter((pack) => pack.interviewType === interviewType || pack.interviewType === "mixed"),
    [interviewType, pluginCatalog.practicePacks]
  );
  const questions = useMemo(() => {
    if (practicePackId !== "built-in") {
      const pluginQuestions = listPluginPracticeQuestions(pluginCatalog.practicePacks, interviewType, practicePackId);
      if (pluginQuestions.length > 0) {
        return pluginQuestions;
      }
    }

    return listPracticeQuestions(interviewType);
  }, [interviewType, pluginCatalog.practicePacks, practicePackId]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const activeQuestion = questions[questionIndex % questions.length];
  const [state, setState] = useState<PracticeState>(() => createState(activeQuestion));
  const [draftAnswer, setDraftAnswer] = useState("");
  const [aiFollowUp, setAiFollowUp] = useState("");
  const [aiFollowUpBusy, setAiFollowUpBusy] = useState(false);
  const [status, setStatus] = useState("Ready for practice");
  const feedback = state.status === "scored" ? scorePracticeAnswer({ question: activeQuestion, answer: state.answer }) : null;

  useEffect(() => {
    let cancelled = false;

    async function loadPracticeSettings() {
      const [rawCatalog, rawConfig] = await Promise.all([
        getSetting(PLUGIN_CATALOG_SETTING_KEY),
        getSetting(APP_CONFIG_SETTING_KEY)
      ]);
      const hydratedConfig = await hydrateProviderApiKeys(parseAppConfig(rawConfig));
      if (!cancelled) {
        setPluginCatalog(parsePluginCatalog(rawCatalog));
        setAppConfig(hydratedConfig);
      }
    }

    void loadPracticeSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  function changeInterviewType(nextType: InterviewType) {
    const nextQuestions = listPracticeQuestions(nextType);
    setInterviewType(nextType);
    setPracticePackId("built-in");
    setQuestionIndex(0);
    setState(createState(nextQuestions[0]));
    setDraftAnswer("");
    setAiFollowUp("");
    setStatus("Practice pack loaded");
  }

  function changePracticePack(nextPackId: string) {
    const nextQuestions =
      nextPackId === "built-in"
        ? listPracticeQuestions(interviewType)
        : listPluginPracticeQuestions(pluginCatalog.practicePacks, interviewType, nextPackId);
    setPracticePackId(nextPackId);
    setQuestionIndex(0);
    setState(createState(nextQuestions[0] ?? listPracticeQuestions(interviewType)[0]));
    setDraftAnswer("");
    setAiFollowUp("");
    setStatus(nextPackId === "built-in" ? "Built-in practice pack loaded" : "Plugin practice pack loaded");
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
    setAiFollowUp("");
    setStatus("Answer scored locally");
  }

  function nextQuestion() {
    const nextIndex = (questionIndex + 1) % questions.length;
    const next = questions[nextIndex];
    setQuestionIndex(nextIndex);
    setState(nextPracticeState(state, { type: "next_question", question: next.question }));
    setDraftAnswer("");
    setAiFollowUp("");
    setStatus("Next interviewer question ready");
  }

  async function generateAiFollowUp() {
    const answer = (state.answer || draftAnswer).trim();
    if (!answer) {
      setStatus("Write or score an answer before asking for an AI follow-up.");
      return;
    }

    const providerConfigs = selectRunnableProviders(appConfig);
    if (providerConfigs.length === 0) {
      setStatus(
        appConfig.security.localOnlyMode
          ? "Enable a local AI provider before generating a practice follow-up."
          : "Enable an AI provider in Settings before generating a practice follow-up."
      );
      return;
    }

    setAiFollowUp("");
    setAiFollowUpBusy(true);
    setStatus(`Generating practice follow-up with ${providerConfigs[0].label}...`);

    try {
      const router = new ProviderRouter(providerConfigs.map((provider) => createConfiguredProvider(provider)));
      let response = "";
      for await (const chunk of router.chatStream({
        messages: buildPracticeFollowUpMessages({
          interviewType,
          question: activeQuestion.question,
          answer,
          score: state.score
        }),
        model: providerConfigs[0].model,
        temperature: 0.7,
        maxTokens: 160
      })) {
        response += chunk;
        setAiFollowUp(response);
      }

      setStatus(response.trim() ? "AI follow-up ready" : "AI provider returned an empty follow-up");
    } catch (error) {
      setStatus(`AI follow-up failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setAiFollowUpBusy(false);
    }
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
        <label className="practice-type-picker">
          <span>Practice pack</span>
          <select value={practicePackId} onChange={(event) => changePracticePack(event.currentTarget.value)}>
            <option value="built-in">Built-in questions</option>
            {pluginPracticePacks.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.name}
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
          <Button variant="primary" icon={<Bot size={16} />} onClick={generateAiFollowUp} disabled={aiFollowUpBusy}>
            {aiFollowUpBusy ? "Generating Follow-Up" : "Generate AI Follow-Up"}
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
        {aiFollowUp ? (
          <div className="practice-feedback">
            <strong>AI Follow-Up</strong>
            <p>{aiFollowUp}</p>
          </div>
        ) : null}
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
