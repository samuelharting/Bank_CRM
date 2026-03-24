import * as microsoftTeams from "@microsoft/teams-js";

export function isInTeams(): boolean {
  return (
    window.parent !== window.self ||
    navigator.userAgent.includes("Teams") ||
    new URLSearchParams(window.location.search).has("inTeams")
  );
}

export async function initializeTeams(): Promise<void> {
  if (!isInTeams()) return;
  await microsoftTeams.app.initialize();
  microsoftTeams.app.notifySuccess();
}

export async function getTeamsContext() {
  if (!isInTeams()) return null;
  return microsoftTeams.app.getContext();
}

export async function getTeamsAuthToken(): Promise<string | null> {
  if (!isInTeams()) return null;
  try {
    return await microsoftTeams.authentication.getAuthToken();
  } catch {
    return null;
  }
}

export function openInBrowser(url: string): void {
  if (isInTeams()) {
    microsoftTeams.app.openLink(url);
    return;
  }
  window.open(url, "_blank");
}
