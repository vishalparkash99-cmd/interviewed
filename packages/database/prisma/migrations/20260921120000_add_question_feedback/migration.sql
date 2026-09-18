-- CreateTable
CREATE TABLE "interview_question_feedback" (
    "id" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answerId" TEXT,
    "technicalAccuracy" DOUBLE PRECISION NOT NULL,
    "communicationClarity" DOUBLE PRECISION NOT NULL,
    "problemSolvingStructure" DOUBLE PRECISION NOT NULL,
    "pacingAndConciseness" DOUBLE PRECISION NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "keyOmissions" JSONB NOT NULL DEFAULT '[]',
    "improvedAnswer" TEXT,
    "actionableTips" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'deterministic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_question_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "interview_question_feedback_interviewId_questionId_key" ON "interview_question_feedback"("interviewId", "questionId");

-- AddForeignKey
ALTER TABLE "interview_question_feedback" ADD CONSTRAINT "interview_question_feedback_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "interviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_question_feedback" ADD CONSTRAINT "interview_question_feedback_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "interview_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_question_feedback" ADD CONSTRAINT "interview_question_feedback_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "interview_answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

