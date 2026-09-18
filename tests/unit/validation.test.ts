import {
  createJobSchema,
  createCandidateSchema,
  createInterviewSchema,
  shortlistCandidateSchema,
  createEmailSchema,
  loginSchema,
  registerSchema,
  submitAnswerSchema,
  completeInterviewSchema,
  createQuestionSchema,
} from "../../apps/api/src/validation";

describe("Validation Schemas", () => {
  describe("createJobSchema", () => {
    it("accepts minimal valid job", () => {
      const result = createJobSchema.safeParse({ title: "Engineer", description: "Build stuff" });
      expect(result.success).toBe(true);
    });

    it("applies defaults correctly", () => {
      const result = createJobSchema.safeParse({ title: "Engineer", description: "Build stuff" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.employmentType).toBe("fulltime");
        expect(result.data.interviewDuration).toBe(45);
        expect(result.data.interviewDifficulty).toBe("medium");
        expect(result.data.shortlistCount).toBe(10);
        expect(result.data.minimumScreeningScore).toBe(60);
      }
    });

    it("accepts full job specification", () => {
      const result = createJobSchema.safeParse({
        title: "Senior Backend Engineer",
        description: "Design and build APIs",
        department: "Engineering",
        location: "Remote",
        employmentType: "fulltime",
        experienceMinYears: 5,
        experienceMaxYears: 15,
        requiredSkills: ["Node.js", "TypeScript", "PostgreSQL"],
        preferredSkills: ["GraphQL", "Kubernetes"],
        interviewDuration: 60,
        interviewDifficulty: "hard",
        scoringWeights: { technical: 40, experience: 30, responsibilities: 20, qualification: 5, domain: 5 },
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty title", () => {
      const result = createJobSchema.safeParse({ title: "", description: "Build stuff" });
      expect(result.success).toBe(false);
    });

    it("rejects invalid interviewDuration (too low)", () => {
      const result = createJobSchema.safeParse({ title: "Engineer", description: "desc", interviewDuration: 2 });
      expect(result.success).toBe(false);
    });

    it("rejects invalid interviewDifficulty", () => {
      const result = createJobSchema.safeParse({ title: "Engineer", description: "desc", interviewDifficulty: "extreme" });
      expect(result.success).toBe(false);
    });
  });

  describe("createCandidateSchema", () => {
    it("accepts minimal valid candidate", () => {
      const result = createCandidateSchema.safeParse({ name: "Alex", email: "alex@test.com" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid email", () => {
      const result = createCandidateSchema.safeParse({ name: "Alex", email: "not-an-email" });
      expect(result.success).toBe(false);
    });

    it("rejects empty name", () => {
      const result = createCandidateSchema.safeParse({ name: "", email: "alex@test.com" });
      expect(result.success).toBe(false);
    });
  });

  describe("createInterviewSchema", () => {
    it("accepts minimal interview", () => {
      const result = createInterviewSchema.safeParse({ candidateId: "c1", jobId: "j1" });
      expect(result.success).toBe(true);
    });

    it("applies duration default", () => {
      const result = createInterviewSchema.safeParse({ candidateId: "c1", jobId: "j1" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.duration).toBe(45);
      }
    });

    it("rejects duration below minimum", () => {
      const result = createInterviewSchema.safeParse({ candidateId: "c1", jobId: "j1", duration: 3 });
      expect(result.success).toBe(false);
    });
  });

  describe("shortlistCandidateSchema", () => {
    it("accepts approve decision", () => {
      const result = shortlistCandidateSchema.safeParse({ candidateId: "c1", jobId: "j1", decision: "approve" });
      expect(result.success).toBe(true);
    });

    it("accepts reject decision", () => {
      const result = shortlistCandidateSchema.safeParse({ candidateId: "c1", jobId: "j1", decision: "reject" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid decision", () => {
      const result = shortlistCandidateSchema.safeParse({ candidateId: "c1", jobId: "j1", decision: "maybe" });
      expect(result.success).toBe(false);
    });
  });

  describe("createEmailSchema", () => {
    it("accepts valid email", () => {
      const result = createEmailSchema.safeParse({
        recipient: "test@example.com",
        subject: "Interview invite",
        body: "<p>You're invited</p>",
      });
      expect(result.success).toBe(true);
    });

    it("applies invitation type default", () => {
      const result = createEmailSchema.safeParse({
        recipient: "test@example.com",
        subject: "Interview",
        body: "Hello",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe("invitation");
      }
    });

    it("rejects invalid recipient email", () => {
      const result = createEmailSchema.safeParse({
        recipient: "not-email",
        subject: "Test",
        body: "Hello",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("loginSchema", () => {
    it("accepts valid login", () => {
      const result = loginSchema.safeParse({ email: "user@test.com", password: "pass123" });
      expect(result.success).toBe(true);
    });

    it("rejects missing password", () => {
      const result = loginSchema.safeParse({ email: "user@test.com", password: "" });
      expect(result.success).toBe(false);
    });
  });

  describe("registerSchema", () => {
    it("accepts valid registration", () => {
      const result = registerSchema.safeParse({
        email: "user@test.com",
        password: "securepass",
        firstName: "John",
        lastName: "Doe",
        companyName: "ACME Corp",
      });
      expect(result.success).toBe(true);
    });

    it("rejects short password", () => {
      const result = registerSchema.safeParse({
        email: "user@test.com",
        password: "short",
        firstName: "John",
        lastName: "Doe",
        companyName: "ACME Corp",
      });
      expect(result.success).toBe(false);
    });

    it("rejects passwords shorter than 8 characters", () => {
      const result = registerSchema.safeParse({
        email: "user@test.com",
        password: "sevench",
        firstName: "John",
        lastName: "Doe",
        companyName: "ACME Corp",
      });
      expect(result.success).toBe(false);
    });

    it("rejects fields that exceed maximum lengths", () => {
      const oversized = registerSchema.safeParse({
        email: "user@test.com",
        password: "securepass123",
        firstName: "J",
        lastName: "D".repeat(101),
        companyName: "ACME Corp",
      });
      expect(oversized.success).toBe(false);

      const longLogin = loginSchema.safeParse({
        email: "user@test.com",
        password: "x".repeat(257),
      });
      expect(longLogin.success).toBe(false);

      const longSubject = createEmailSchema.safeParse({
        recipient: "test@example.com",
        subject: "s".repeat(501),
        body: "Hello",
      });
      expect(longSubject.success).toBe(false);
    });

    it("rejects payloads that exceed job schema limits", () => {
      const result = createJobSchema.safeParse({
        title: "E".repeat(256),
        description: "Build stuff",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("submitAnswerSchema", () => {
    it("accepts a valid answer", () => {
      const result = submitAnswerSchema.safeParse({
        interviewToken: "tok",
        questionId: "q1",
        answer: "My answer",
        durationSeconds: 30,
        confidence: 60,
      });
      expect(result.success).toBe(true);
    });

    it("rejects oversized token and duration", () => {
      expect(
        submitAnswerSchema.safeParse({
          interviewToken: "t".repeat(513),
          questionId: "q1",
          answer: "a",
        }).success
      ).toBe(false);
      expect(
        submitAnswerSchema.safeParse({
          interviewToken: "tok",
          questionId: "q1",
          answer: "a",
          durationSeconds: 3601,
        }).success
      ).toBe(false);
    });

    it("rejects empty answers", () => {
      expect(
        submitAnswerSchema.safeParse({
          interviewToken: "tok",
          questionId: "q1",
          answer: "",
        }).success
      ).toBe(false);
    });
  });

  describe("completeInterviewSchema", () => {
    it("rejects oversized tokens", () => {
      expect(
        completeInterviewSchema.safeParse({ interviewToken: "t".repeat(513) }).success
      ).toBe(false);
    });
  });

  describe("createQuestionSchema", () => {
    it("rejects oversized question text", () => {
      expect(
        createQuestionSchema.safeParse({
          section: "s",
          question: "q".repeat(4001),
          type: "open",
        }).success
      ).toBe(false);
    });
  });
});
