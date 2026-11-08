import { Request, Response } from "express";
import { errorResponse } from "../http/response";

export function notFound(req: Request, res: Response) {
  res.status(404).json(errorResponse(`Rota não encontrada: ${req.method} ${req.originalUrl}`));
}

