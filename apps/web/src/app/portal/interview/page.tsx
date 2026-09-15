"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

type Message = {
  id: string;
  role: "ai" | "candidate";
  content: string;
  timestamp: number;
};

type Question = {
  id: string;
  text: string;
  section?: string;
};

type JoinData = {
  interviewId: string;
  candidateName: string;
  jobTitle: string;
  duration: number;
  currentQuestion?: Question;
};

type Phase = "connecting" | "ready" | "in_progress" | "completed" | "error";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function InterviewContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [phase, setPhase] = useState<Phase>("connecting");
  const [error, setError] = useState("");
  const [interviewId, setInterviewId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [totalDuration, setTotalDuration] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const [answerTimer, setAnswerTimer] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const answerTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const msgIdRef = useRef(0);

  const nextId = useCallback(() => {
    msgIdRef.current += 1;
    return `msg-${msgIdRef.current}-${Date.now()}`;
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Join interview on mount
  useEffect(() => {
    if (!token) {
      setPhase("error");
      setError("No interview token provided. Please use the link from your invitation email.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // First validate token
        const validateRes = await fetch(`/api/v1/interviews/secure/${encodeURIComponent(token)}`);
        if (!validateRes.ok) {
          if (!cancelled) {
            setPhase("error");
            setError("Invalid or expired interview token.");
          }
          return;
        }

        // Then join to get interview data + first question
        const joinRes = await fetch("/api/v1/interviews/candidate/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewToken: token }),
        });
        const data = (await joinRes.json()) as JoinData & { error?: string };

        if (cancelled) return;

        if (!joinRes.ok) {
          setPhase("error");
          setError(data.error || "Failed to join interview.");
          return;
        }

        setInterviewId(data.interviewId);
        setJobTitle(data.jobTitle);
        setCandidateName(data.candidateName);
        setTotalDuration(data.duration || 1800);
        setTimeRemaining(data.duration || 1800);

        if (data.currentQuestion) {
          setCurrentQuestion(data.currentQuestion);
          setMessages([
            {
              id: nextId(),
              role: "ai",
              content: data.currentQuestion.text,
              timestamp: Date.now(),
            },
          ]);
        }

        setPhase("ready");
      } catch {
        if (!cancelled) {
          setPhase("error");
          setError("Network error. Please check your connection and try again.");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [token, nextId]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "ready" && phase !== "in_progress") return;

    countdownRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [phase]);

  // Auto-end when time runs out
  useEffect(() => {
    if (timeRemaining === 0 && interviewId && (phase === "ready" || phase === "in_progress")) {
      setPhase("completed");
    }
  }, [timeRemaining, phase, interviewId]);

  // Answer timer (counts up per answer)
  useEffect(() => {
    if (phase === "ready" || phase === "in_progress") {
      setAnswerTimer(0);
      answerTimerRef.current = setInterval(() => {
        setAnswerTimer((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (answerTimerRef.current) clearInterval(answerTimerRef.current);
    };
  }, [currentQuestion?.id, phase]);

  const submitAnswer = async () => {
    if (!answer.trim() || !currentQuestion || !interviewId || sending) return;

    setSending(true);
    setPhase("in_progress");

    const candidateMsg: Message = {
      id: nextId(),
      role: "candidate",
      content: answer.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, candidateMsg]);
    setAnswer("");

    try {
      const res = await fetch(`/api/v1/interviews/candidate/${interviewId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewToken: token,
          questionId: currentQuestion.id,
          answer: candidateMsg.content,
          durationSeconds: answerTimer,
        }),
      });
      const data = (await res.json()) as {
        nextQuestion?: Question;
        completed?: boolean;
        error?: string;
      };

      if (!res.ok) {
        setError(data.error || "Failed to submit answer. Please try again.");
        setSending(false);
        return;
      }

      if (data.completed) {
        setPhase("completed");
        setSending(false);
        return;
      }

      if (data.nextQuestion) {
        setCurrentQuestion(data.nextQuestion);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "ai",
            content: data.nextQuestion!.text,
            timestamp: Date.now(),
          },
        ]);
      }
    } catch {
      setError("Network error. Your answer may not have been saved.");
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submitAnswer();
    }
  };

  const handleEndInterview = () => {
    if (window.confirm("Are you sure you want to end the interview early?")) {
      setPhase("completed");
    }
  };

  if (phase === "error") {
    return (
      <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="card" style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>!</div>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p className="text-muted" style={{ marginBottom: 20 }}>{error}</p>
          <a href="/portal" className="btn btn-primary">Return to Portal</a>
        </div>
      </div>
    );
  }

  if (phase === "completed") {
    return (
      <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className="card" style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>&#10003;</div>
          <h2 style={{ marginBottom: 8 }}>Interview Complete</h2>
          <p className="text-muted" style={{ marginBottom: 8 }}>
            Thank you, <strong>{candidateName}</strong>. Your responses for <strong>{jobTitle}</strong> have been recorded.
          </p>
          <p className="text-muted" style={{ marginBottom: 24 }}>
            The hiring team will review your interview and be in touch.
          </p>
          <div className="badge badge-success" style={{ marginBottom: 20 }}>Submitted</div>
          <div>
            <a href="/portal" className="btn btn-secondary">Back to Portal</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="portal-layout" style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Header */}
      <div className="interview-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <span className="interview-header-title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {jobTitle || "Interview"}
          </span>
        </div>

        <div className="progress-bar-track" style={{ minWidth: 80 }}>
          <div
            className="progress-bar-fill"
            style={{ width: `${totalDuration > 0 ? ((totalDuration - timeRemaining) / totalDuration) * 100 : 0}%` }}
          />
        </div>

        <span className="timer-badge">{formatTime(timeRemaining)}</span>

        <button
          className="btn btn-danger btn-sm"
          onClick={handleEndInterview}
        >
          End Interview
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        <div className="interview-container" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <div className="chat-thread">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-msg ${msg.role === "ai" ? "chat-msg-ai" : "chat-msg-candidate"}`}
              >
                <div
                  className={`chat-avatar ${msg.role === "ai" ? "chat-avatar-ai" : "chat-avatar-candidate"}`}
                >
                  {msg.role === "ai" ? "AI" : (candidateName.charAt(0).toUpperCase() || "Y")}
                </div>
                <div className={`chat-bubble ${msg.role === "ai" ? "chat-ai" : "chat-candidate"}`}>
                  {msg.content}
                </div>
              </div>
            ))}

            {messages.length === 0 && (
              <div className="text-center" style={{ padding: "40px 0" }}>
                <span className="spinner" />
                <p className="text-muted" style={{ marginTop: 12 }}>Loading your first question…</p>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input area */}
      {currentQuestion && (
        <div style={{ borderTop: "1px solid var(--color-border)", background: "var(--color-surface)", padding: "16px" }}>
          <div className="interview-container" style={{ paddingTop: 0, paddingBottom: 0 }}>
            {currentQuestion.section && (
              <div className="section-label">{currentQuestion.section}</div>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                className="textarea"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your answer here… (Ctrl+Enter to submit)"
                rows={3}
                disabled={sending}
                autoFocus
              />
              <button
                className="btn btn-primary"
                onClick={submitAnswer}
                disabled={sending || !answer.trim()}
                style={{ height: 44, flexShrink: 0 }}
              >
                {sending ? <span className="spinner" /> : "Send"}
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <span className="text-muted">Answer time: {formatTime(answerTimer)}</span>
              <span className="text-muted">Ctrl+Enter to submit</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function InterviewPage() {
  return (
    <Suspense
      fallback={
        <div className="portal-layout" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
          <span className="spinner" />
        </div>
      }
    >
      <InterviewContent />
    </Suspense>
  );
}
