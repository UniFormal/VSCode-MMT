import locateJavaHome from "locate-java-home";
import { workspace } from "vscode";

export function getJavaHome(): Promise<string> {
  const userJavaHome = workspace.getConfiguration("metals").get("javaHome");
  if (typeof userJavaHome === "string" && userJavaHome.trim() !== "") {
    return Promise.resolve(userJavaHome);
  } else {
    return new Promise((resolve, reject) => {
      locateJavaHome({}, (err, javaHomes) => {
        if (err) {
          reject(err);
        } else if (!javaHomes || javaHomes.length === 0) {
          reject(new Error("No suitable Java version found"));
        } else {
          javaHomes.sort((a, b) => {
            return b.security - a.security;
          });
          const jdkHome = javaHomes.find(j => j.isJDK);
          if (jdkHome) {
            resolve(jdkHome.path);
          } else {
            resolve(javaHomes[0].path);
          }
        }
      });
    });
  }
}