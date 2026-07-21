export interface Environment {
  readonly host: string;
  readonly port: number;
  readonly nodeEnv: "development" | "production";
  readonly isProduction: boolean;
}

export function loadEnvironment(): Environment {
  const nodeEnv = (process.env.NODE_ENV ?? "development") as "development" | "production";
  const isProduction = nodeEnv === "production";
  const host = process.env.HOST ?? "127.0.0.1";
  const port = Number(process.env.PORT ?? 8787);
  if (host !== "127.0.0.1" && host !== "localhost" && !isProduction) {
    throw new Error(`Refusing to bind non-loopback host in development: ${host}`);
  }
  return { host, port, nodeEnv, isProduction };
}
