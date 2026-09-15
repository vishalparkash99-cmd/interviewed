import { MatchingEngine } from "../../packages/ai/src/matching-engine";
import { InterviewPlanner } from "../../packages/ai/src/interview-planner";

describe("Matching Engine", () => {
  it("should compute skill score correctly", () => {
    const engine = new MatchingEngine(null as any);
    const score = (engine as any).computeSkillScore(["Node.js", "Python"], ["Node.js", "Java"], []);
    expect(score).toBeGreaterThan(30);
    expect(score).toBeLessThan(100);
  });

  it("should return high score for all matching skills", () => {
    const engine = new MatchingEngine(null as any);
    const score = (engine as any).computeSkillScore(["Node.js", "Java"], ["Node.js", "Java"], []);
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it("should return low score for no matching skills", () => {
    const engine = new MatchingEngine(null as any);
    const score = (engine as any).computeSkillScore(["Python", "Go"], ["Node.js", "Java", "React"], []);
    expect(score).toBeLessThan(50);
  });

  it("should compute experience score correctly", () => {
    const engine = new MatchingEngine(null as any);
    const score = (engine as any).computeExperienceScore(5, 3, 10);
    expect(score).toBeGreaterThan(60);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("should compute experience score for overqualified candidate", () => {
    const engine = new MatchingEngine(null as any);
    const score = (engine as any).computeExperienceScore(20, 3, 10);
    expect(score).toBe(100);
  });

  it("should match candidate and return result structure", async () => {
    const engine = new MatchingEngine(null as any);
    const result = await engine.matchCandidate(
      {
        name: "Test",
        yearsOfExperience: 5,
        skills: ["Node.js", "TypeScript"],
        experience: [{ title: "Engineer", company: "ACME", summary: "Built APIs" }],
      },
      {
        requiredSkills: ["Node.js", "React"],
        preferredSkills: ["TypeScript"],
        requiredQualifications: [],
        preferredQualifications: [],
        rolesResponsibilities: [{ title: "Build APIs", description: "Design and build REST APIs" }],
        domain: "tech",
      }
    );

    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("recommendation");
    expect(result).toHaveProperty("strengths");
    expect(result).toHaveProperty("gaps");
    expect(typeof result.overallScore).toBe("number");
    expect(typeof result.recommendation).toBe("string");
  });
});

describe("Interview Planner", () => {
  it("should generate a plan with sections", async () => {
    const planner = new InterviewPlanner(null as any);
    const plan = await planner.planInterview({
      jobTitle: "Backend Engineer",
      jobDescription: "Build APIs",
      requiredSkills: ["Node.js"],
      rolesResponsibilities: [],
      candidateResume: {
        name: "Test",
        yearsOfExperience: 5,
        skills: ["Node.js"],
        experience: [],
      },
      candidateMatchScore: 80,
      interviewDurationMinutes: 45,
      difficulty: "medium",
    });
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(plan.totalDurationMinutes).toBeGreaterThan(0);
  });

  it("should include technical section for skill-based jobs", async () => {
    const planner = new InterviewPlanner(null as any);
    const plan = await planner.planInterview({
      jobTitle: "Full Stack Engineer",
      jobDescription: "Build web apps",
      requiredSkills: ["React", "Node.js", "TypeScript"],
      rolesResponsibilities: [{ title: "Frontend", description: "Build React components" }],
      candidateResume: {
        name: "Test",
        yearsOfExperience: 3,
        skills: ["React", "Node.js"],
        experience: [{ title: "Dev", company: "TechCo", summary: "Web dev" }],
      },
      candidateMatchScore: 75,
      interviewDurationMinutes: 60,
      difficulty: "medium",
    });
    const techSection = plan.sections.find((s) => s.section === "technical");
    expect(techSection).toBeDefined();
  });
});
