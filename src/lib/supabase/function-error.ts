type FunctionErrorLike = {
  message?: unknown;
  context?: {
    status?: number;
    clone?: () => { json: () => Promise<unknown> };
  };
};

/**
 * Supabase FunctionsHttpError keeps the function response in `context`, while
 * its public message is intentionally generic. Read the structured response
 * so administrators see the actionable server-side validation/database error.
 */
export async function readFunctionError(error: unknown, fallback = "The server operation failed.") {
  const candidate = (error ?? {}) as FunctionErrorLike;
  let message = typeof candidate.message === "string" ? candidate.message : fallback;
  let status = typeof candidate.context?.status === "number" ? candidate.context.status : 400;

  try {
    const response = candidate.context?.clone?.();
    if (response) {
      const body = await response.json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
        message = body.error;
      }
      if (body && typeof body === "object" && "status" in body && typeof body.status === "number") {
        status = body.status;
      }
    }
  } catch {
    // Keep the SDK's message when the function response is not JSON.
  }

  return { message, status: status >= 400 && status <= 599 ? status : 400 };
}
