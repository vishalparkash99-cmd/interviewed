import {
  buildDeterministicQuestionFeedback,
  DiagnosticFeedbackEngine,
  validateDiagnosticFeedbackInput,
  validateQuestionFeedback,
  validateQuestionFeedbackList,
} from "../../packages/ai/src/diagnostic-feedback";
import {
  InterviewPlanner,
  validateTailoredPromptInput,
} from "../../packages/ai/src/interview-planner";

const baseItem = {
  questionId: "q1",
  question: "Describe how you would design a rate limiter",
  questionType: "design",
  difficulty: "medium",
};

describe("DiagnosticFeedbackEngine", () => {
  it("should produce deterministic feedback when provider is null", async () => {
    const engine = new DiagnosticFeedbackEngine(null as any);
    const feedback = await engine.generateFeedback({
      interviewId: "iv-1",
      jobTitle: "Backend Engineer",
      jobDescription: "Build scalable APIs",
      requiredSkills: ["Node.js", "Redis"],
      items: [{ ...baseItem, answer: "I used Redis-based token buckets to cap requests per user." }],
    });

    expect(feedback).toHaveLength(1);
    expect(feedback[0].questionId).toBe("q1");
    for (const score of Object.values(feedback[0].scores)) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
    expect(feedback[0].improvedAnswer.length).toBeGreaterThan(0);
  });

  it("should produce deterministic feedback for a mock provider", async () => {
    const engine = new DiagnosticFeedbackEngine({ name: "mock" } as any);
    const feedback = await engine.generateFeedback({
      interviewId: "iv-1",
      jobTitle: "Engineer",
      jobDescription: "Build software",
      requiredSkills: ["Node.js"],
      items: [
        { ...baseItem, questionId: "q1", answer: "I built REST APIs with Node.js at scale." },
        { ...baseItem, questionId: "q2", answer: "" },
      ],
    });

    expect(feedback).toHaveLength(2);
    expect(feedback.map((f) => f.questionId)).toEqual(["q1", "q2"]);
  });

  it("should fall back to deterministic feedback when the AI call fails", async () => {
    const engine = new DiagnosticFeedbackEngine({
      name: "openai",
      complete: jest.fn().mockRejectedValue(new Error("provider down")),
    } as any);
    const feedback = await engine.generateFeedback({
      interviewId: "iv-1",
      jobTitle: "Engineer",
      jobDescription: "Build software",
      requiredSkills: ["Node.js"],
      items: [{ ...baseItem, answer: "Node.js experience deploying microservices." }],
    });

    expect(feedback).toHaveLength(1);
    expect(feedback[0].improvedAnswer.length).toBeGreaterThan(0);
    expect(validateQuestionFeedback(feedback[0])).toBeDefined();
  });

  it("should prefer AI scores but keep the deterministic sample answer when AI omits it", async () => {
    const aiRaw = JSON.stringify([
      {
        questionId: "q1",
        scores: { technicalAccuracy: 88, communicationClarity: 12, problemSolvingStructure: 70, pacingAndConciseness: 60, overallScore: 57 },
        strengths: [],
        keyOmissions: [],
        improvedAnswer: "",
        actionableTips: [],
      },
    ]);
    const engine = new DiagnosticFeedbackEngine({
      name: "openai",
      complete: jest.fn().mockResolvedValue({ content: aiRaw }),
    } as any);
    const [feedback] = await engine.generateFeedback({
      interviewId: "iv-1",
      jobTitle: "Engineer",
      jobDescription: "Build software",
      requiredSkills: ["Node.js"],
      items: [{ ...baseItem, answer: "I shipped Node.js APIs serving 10k requests/minute." }],
    });

    expect(feedback.scores.technicalAccuracy).toBe(88);
    expect(feedback.scores.communicationClarity).toBe(12);
    expect(feedback.improvedAnswer.length).toBeGreaterThan(0);
  });
});

describe("buildDeterministicQuestionFeedback", () => {
  it("should flag an empty answer with zero overall score", () => {
    const fb = buildDeterministicQuestionFeedback(
      { ...baseItem, answer: "   " },
      ["Node.js"]
    );
    expect(fb.scores.overallScore).toBe(0);
    expect(fb.keyOmissions.some((k) => /no answer/i.test(k))).toBe(true);
    expect(fb.improvedAnswer.length).toBeGreaterThan(0);
  });

  it("should credit skill coverage with a higher technical score", () => {
    const high = buildDeterministicQuestionFeedback(
      { ...baseItem, answer: "Node.js, Redis, Kubernetes experience building scale-out services." },
      ["Node.js", "Redis", "Kubernetes"]
    );
    const low = buildDeterministicQuestionFeedback(
      { ...baseItem, answer: "I have general engineering experience in this domain." },
      ["Node.js", "Redis", "Kubernetes"]
    );
    expect(high.scores.technicalAccuracy).toBeGreaterThan(low.scores.technicalAccuracy);
    expect(high.strengths.length).toBeGreaterThanOrEqual(low.strengths.length);
  });

  it("should reward a structured answer over a rambling one", () => {
    const structured = buildDeterministicQuestionFeedback(
      {
        ...baseItem,
        questionType: "behavioral",
        answer:
          "First, I clarified the objective, because half the tickets were duplicates. " +
          "\n\n- Track 1: dedupe at the API gateway\n- Track 2: queue retries\n- Track 3: dashboards\n\n" +
          "Then I shipped the changes, so that failures no longer blocked the pipeline, and deploy time fell by 20%.",
      },
      []
    );
    const rambling = buildDeterministicQuestionFeedback(
      { ...baseItem, questionType: "behavioral", answer: "um like we did a bunch of stuff um which is fine um" },
      []
    );
    expect(structured.scores.problemSolvingStructure).toBeGreaterThan(rambling.scores.problemSolvingStructure);
    expect(structured.strengths.some((s) => /structured/.test(s))).toBe(true);
  });
});

describe("Feedback validation", () => {
  it("should accept a generated feedback entry", () => {
    const fb = buildDeterministicQuestionFeedback({ ...baseItem, answer: "A solid answer." }, []);
    expect(() => validateQuestionFeedbackList([fb])).not.toThrow();
  });

  it("should reject scores outside the 0-100 range", () => {
    const fb = buildDeterministicQuestionFeedback({ ...baseItem, answer: "A solid answer." }, []);
    expect(() =>
      validateQuestionFeedbackList([{ ...fb, scores: { ...fb.scores, overallScore: 150 } }])
    ).toThrow();
  });

  it("should reject incomplete input", () => {
    expect(() => validateDiagnosticFeedbackInput({ interviewId: "" })).toThrow();
    expect(() =>
      validateDiagnosticFeedbackInput({
        interviewId: "iv-1",
        jobTitle: "Engineer",
        jobDescription: "Build",
        requiredSkills: [],
        items: [{ ...baseItem, answer: "" }],
      })
    ).not.toThrow();
  });
});

describe("Tailored question generation", () => {
  const prompt = {
    resumeText: "Senior Node.js engineer, 7 years, built payment platforms serving 1M users.",
    jobDescription: "Own the payments backend. Requirements: Node.js, PostgreSQL, Kafka, distributed systems.",
    roleTitle: "Senior Backend Engineer",
    experienceLevel: "Senior (7+ years)",
  };

  it("should reject empty resume or JD", () => {
    expect(() => validateTailoredPromptInput({ ...prompt, resumeText: "" })).toThrow();
    expect(() => validateTailoredPromptInput({ ...prompt, jobDescription: " " })).toThrow();
  });

  it("should accept a valid tailored prompt", () => {
    expect(() => validateTailoredPromptInput(prompt)).not.toThrow();
  });

  it("should return fallback questions when provider is unavailable", async () => {
    const planner = new InterviewPlanner(null as any);
    const questions = await planner.generateTailoredQuestions(prompt, 5);
    expect(questions).toHaveLength(5);
    for (const q of questions) {
      expect(q.text.length).toBeGreaterThan(0);
      expect(typeof q.durationMinutes).toBe("number");
      expect(["easy", "medium", "hard"]).toContain(q.difficulty);
    }
  });

  it("should not expose raw untrusted resume text in fallback questions", async () => {
    const planner = new InterviewPlanner(null as any);
    const questions = await planner.generateTailoredQuestions(
      { ...prompt, resumeText: "SECRET_TOKEN_XYZ payment internals" },
      3
    );
    for (const q of questions) {
      expect(q.text).not.toContain("SECRET_TOKEN_XYZ");
    }
  });
});