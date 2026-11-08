import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError";
import { errorResponse } from "../http/response";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const errors = err.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
    return res.status(422).json(errorResponse("Dados inválidos", errors));
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json(errorResponse(err.message, err.errors));
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json(errorResponse("JSON inválido no corpo da requisição"));
  }

  console.error(err);
  return res.status(500).json(errorResponse("Erro interno do servidor"));
}