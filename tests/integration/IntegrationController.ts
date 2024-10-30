import { exec } from "child_process";
import * as path from "path";

export class IntegrationController {
  private static controller = new AbortController();

  private constructor() {}

  private static run(command: string, env?: Record<string, any>, cwd?: string) {
    const { signal } = this.controller;
    return exec(
      command,
      {
        encoding: "utf8",
        cwd: cwd || process.cwd(),
        signal: signal,
        env: Object.assign({}, process.env, env || {}),
      },
      (err, stdout, stderr) => {
        if (stdout) console.log(`[${command}] ` + stdout);
        if (stderr) console.error(`[${command}] ` + stderr);
        if (err) console.error(`[${command}] Interrupted with ` + stderr);
      }
    );
  }

  static async setupBackup() {
    return new Promise<void>((resolve, reject) => {
      const proc = this.run(
        "docker compose up -d",
        process.env,
        path.join(process.cwd(), "docker")
      );
      proc.on("exit", (code) => {
        if (code !== 0) return reject("Error in backup System setup: " + code);

        console.log("Backup system setup");
        return resolve();
      });
    });
  }

  static async loginDocker() {
    return new Promise<void>((resolve, reject) => {
      const proc = this.run("npm run docker:login", process.env, process.cwd());
      proc.on("exit", (code) => {
        if (code === 0) return resolve();
        reject(code);
      });
    });
  }

  static async dropBackup() {
    const proc = this.run(
      "docker compose down --rmi all -v",
      process.env,
      path.join(process.cwd(), "docker")
    );
    proc.on("exit", (code) => {
      if (code === 0) return console.log("Backup system dropped");
      console.log("Error in backup System drop: " + code);
    });
  }
}
