import { Request, Response } from 'express';
import { prisma } from '../services/prisma.service';
import { asyncHandler } from '../utils/asyncHandler';
import * as api from '../utils/apiResponse';
import { callLLM, aiEnabled } from '../services/ai.service';
import { buildCatchMeUpContext, buildProjectContext } from '../services/projectContext.service';
import { retrieveRelevantChunks } from '../services/vectorStore';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Hard requirement (verbatim): the model must not invent information.
const NO_FABRICATION =
  'Do not invent information not present in the provided data.';

// GET /projects/:projectId/catch-me-up?force=true
// requireProjectMember middleware guarantees an ACCEPTED membership before we get here.
export const catchMeUp = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const force = req.query.force === 'true';

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { catchMeUpSummary: true, catchMeUpAt: true },
  });
  if (!project) return api.error(res, 'Project not found', 404);

  // Serve fresh cache (< 30 min old) unless force-refresh requested.
  const fresh =
    project.catchMeUpSummary &&
    project.catchMeUpAt &&
    Date.now() - project.catchMeUpAt.getTime() < CACHE_TTL_MS;
  if (fresh && !force) {
    return api.success(res, {
      summary: project.catchMeUpSummary,
      generatedAt: project.catchMeUpAt,
      cached: true,
    });
  }

  if (!aiEnabled()) return api.error(res, 'AI features are not configured', 503);

  const context = await buildCatchMeUpContext(projectId);

  const prompt = `You are a helpful project assistant. Based ONLY on the project data below, write a short catch-up summary of 3 to 5 conversational sentences (not a bullet list). Cover: overall progress, key recent events, and anything needing attention (overdue or blocked items). ${NO_FABRICATION}

${context}`;

  const summary = await callLLM(prompt);
  const generatedAt = new Date();

  await prisma.project.update({
    where: { id: projectId },
    data: { catchMeUpSummary: summary, catchMeUpAt: generatedAt },
  });

  return api.success(res, { summary, generatedAt, cached: false });
});

// POST /projects/:projectId/assistant  { question }
export const askProjectAssistant = asyncHandler(async (req: Request, res: Response) => {
  const { projectId } = req.params;
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';

  if (!question) return api.error(res, 'Question is required', 400);

  // Middleware already enforces ACCEPTED membership; re-check explicitly per spec so
  // this endpoint's access boundary is self-contained.
  const { userId } = req.user!;
  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId, status: 'ACCEPTED' },
  });
  if (!membership) return api.error(res, 'Not a member of this project', 403);

  if (!aiEnabled()) return api.error(res, 'AI features are not configured', 503);

  const [structuredContext, relevantChunks] = await Promise.all([
    buildProjectContext(projectId),
    retrieveRelevantChunks(question, projectId),
  ]);

  const excerpts = relevantChunks.map((c) => `[from document] ${c.content}`).join('\n\n');

  const prompt = `You are a project assistant. Answer using ONLY the information below. If the answer isn't present in the data, say you don't have that information — do not guess or fabricate.

PROJECT DATA:
${structuredContext}

RELEVANT DOCUMENT EXCERPTS:
${excerpts || '(no relevant document excerpts)'}

QUESTION: ${question}`;

  const answer = await callLLM(prompt);

  // Resolve unique source attachment ids -> filenames for citation display.
  const sourceIds = [...new Set(relevantChunks.map((c) => c.attachmentId))];
  const sourceRows = sourceIds.length
    ? await prisma.attachment.findMany({
        where: { id: { in: sourceIds }, projectId },
        select: { id: true, fileName: true },
      })
    : [];

  return api.success(res, { answer, sources: sourceRows });
});
