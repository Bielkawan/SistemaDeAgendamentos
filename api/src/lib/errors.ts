export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (what = "Registro") => new AppError(404, "NOT_FOUND", `${what} não encontrado.`);
export const badRequest = (message: string, details?: unknown) => new AppError(400, "BAD_REQUEST", message, details);
export const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);
export const unauthorized = (message = "Sessão expirada. Faça login novamente.") => new AppError(401, "UNAUTHORIZED", message);
