import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";

interface GraphMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  sentDateTime?: string;
  receivedDateTime?: string;
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
}

const tenantId = process.env.GRAPH_TENANT_ID ?? process.env.AZURE_TENANT_ID ?? "";
const clientId = process.env.GRAPH_CLIENT_ID ?? process.env.AZURE_CLIENT_ID ?? "";
const clientSecret = process.env.AZURE_CLIENT_SECRET ?? "";

export const getGraphClient = (): Client => {
  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Graph credentials are not configured");
  }
  const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
  return Client.initWithMiddleware({
    authProvider: {
      getAccessToken: async () => {
        const token = await credential.getToken("https://graph.microsoft.com/.default");
        if (!token?.token) throw new Error("Failed to obtain Graph token");
        return token.token;
      },
    },
  });
};

const withGraphRetry = async <T>(fn: () => Promise<T>, retries = 3): Promise<T> => {
  let attempt = 0;
  let delayMs = 500;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries) throw error;
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
};

export const getUserSentEmails = async (userEntraId: string, since: Date): Promise<GraphMessage[]> => {
  const client = getGraphClient();
  const filter = `sentDateTime ge ${since.toISOString()}`;
  return withGraphRetry(async () => {
    const response = (await client
      .api(`/users/${userEntraId}/mailFolders/SentItems/messages`)
      .query({
        $filter: filter,
        $select: "subject,bodyPreview,toRecipients,sentDateTime",
        $top: "50",
      })
      .get()) as { value?: GraphMessage[] };
    return response.value ?? [];
  });
};

export const getUserReceivedEmails = async (userEntraId: string, since: Date): Promise<GraphMessage[]> => {
  const client = getGraphClient();
  const filter = `receivedDateTime ge ${since.toISOString()}`;
  return withGraphRetry(async () => {
    const response = (await client
      .api(`/users/${userEntraId}/messages`)
      .query({
        $filter: filter,
        $select: "subject,bodyPreview,toRecipients,receivedDateTime",
        $top: "50",
      })
      .get()) as { value?: GraphMessage[] };
    return response.value ?? [];
  });
};
