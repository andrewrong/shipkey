import { execFile } from "node:child_process";

export function exec(
  cmd: string,
  args: string[],
  env?: Record<string, string | undefined>,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { maxBuffer: 10 * 1024 * 1024, env: env ?? process.env },
      (err, stdout, stderr) => {
        if (err)
          reject(new Error(`${cmd} failed: ${stderr?.trim() || err.message}`));
        else resolve(stdout.trim());
      },
    );
  });
}
