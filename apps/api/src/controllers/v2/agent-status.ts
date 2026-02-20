import { Response } from "express";
import { AgentStatusResponse, RequestWithAuth } from "./types";
import {
  supabaseGetAgentByIdDirect,
  supabaseGetAgentRequestByIdDirect,
} from "../../lib/supabase-jobs";
import { logger as _logger, logger } from "../../lib/logger";
import { getJobFromGCS } from "../../lib/gcs-jobs";
import { config } from "../../config";
import {
  getExtract,
  getExtractResult,
  getExtractExpiry,
} from "../../lib/extract/extract-redis";

export async function agentStatusController(
  req: RequestWithAuth<{ jobId: string }, AgentStatusResponse, any>,
  res: Response<AgentStatusResponse>,
) {
  const agentRequest = await supabaseGetAgentRequestByIdDirect(
    req.params.jobId,
  );

  // Fallback: Check Redis for extract job (self-hosted fallback)
  const redisExtract = await getExtract(req.params.jobId);
  if (redisExtract) {
    // Check team_id if possible (req.auth is populated by authMiddleware)
    if (redisExtract.team_id && redisExtract.team_id !== req.auth.team_id) {
      return res.status(404).json({
        success: false,
        error: "Agent job not found",
      });
    }

    let data: any = undefined;
    if (redisExtract.status === "completed") {
      const result = await getExtractResult(req.params.jobId);
      // Flatten single item array to object if needed, matching Agent behavior
      data = Array.isArray(result) && result.length === 1 ? result[0] : result;
    }

    return res.status(200).json({
      success: true,
      status: redisExtract.status,
      error: redisExtract.error,
      data,
      model: "spark-1-pro", // Default for fallback
      expiresAt: (await getExtractExpiry(req.params.jobId)).toISOString(),
      creditsUsed: redisExtract.creditsBilled,
    });
  }

  return res.status(404).json({
    success: false,
    error: "Agent job not found",
  });
}
