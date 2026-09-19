type BreakageNotification = {
  id: string;
  status: "pending" | "sent" | "failed";
  payload: {
    event_name?: string;
    team_number?: number;
    match_number?: number;
    match_type?: "qualification" | "playoff" | "practice";
    manual_match?: { stage?: string; label?: string };
    scout_name?: string;
    issues?: { timestamp?: string; issue?: string }[];
  };
};

function manualMatchLabel(manualMatch: BreakageNotification["payload"]["manual_match"]) {
  const stage = manualMatch?.stage?.trim() ?? "";
  const label = manualMatch?.label?.trim() ?? "";
  const stageLabel = ({ qualification: "Qualification", practice: "Practice", quarterfinal: "Quarterfinal", semifinal: "Semifinal", final: "Final" } as Record<string, string>)[stage.toLowerCase()] ?? (stage && !["other", "other / exception", "manual match"].includes(stage.toLowerCase()) ? stage : "");
  return label ? `${stageLabel || "Match"} ${label}` : stageLabel || "Match details unavailable";
}

const requiredSecret = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
};

const secretApiKey = () => {
  const keys = JSON.parse(requiredSecret("SUPABASE_SECRET_KEYS")) as Record<string, string>;
  const key = keys.default;
  if (!key) throw new Error("SUPABASE_SECRET_KEYS.default is not configured");
  return key;
};

function messageFor(notification: BreakageNotification) {
  const { payload } = notification;
  const issues = (Array.isArray(payload.issues) ? payload.issues : []).filter((issue) => issue.issue?.trim());
  const [firstIssue, ...additionalIssues] = issues;
  const primaryIssue = firstIssue?.issue?.trim() ?? "Breakage reported";
  const title = `⚠️ ${payload.team_number ?? "Unknown team"} - ${primaryIssue}`.slice(0, 150);
  const matchType = payload.match_type === "practice" ? "Practice" : payload.match_type === "playoff" ? "Playoff Match" : "Qualification";
  const match = typeof payload.match_number === "number" ? `${matchType} ${payload.match_number}` : manualMatchLabel(payload.manual_match);
  const details = [
    `*Match:* ${match}`,
    `*Scout:* ${payload.scout_name ?? "Unknown"}`,
    ...(additionalIssues.length ? [`*Additional issues:*\n${additionalIssues.map(({ timestamp, issue }) => `• ${timestamp ? `${timestamp} — ` : ""}${issue}`).join("\n")}`] : []),
  ];

  return {
    text: title,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: title },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: details.join("\n"),
        },
      },
    ],
  };
}

async function updateNotification(
  apiUrl: string,
  headers: Record<string, string>,
  notificationId: string,
  values: Record<string, unknown>,
) {
  const response = await fetch(
    `${apiUrl}/rest/v1/breakage_slack_notifications?id=eq.${encodeURIComponent(notificationId)}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify(values),
    },
  );
  if (!response.ok) throw new Error("Notification delivery status could not be recorded");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let notificationId: string | undefined;
  let apiUrl: string | undefined;
  let headers: Record<string, string> | undefined;

  try {
    if (request.headers.get("x-breakage-notification-secret") !== requiredSecret("BREAKAGE_NOTIFICATION_SECRET")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    notificationId = typeof body.notification_id === "string" ? body.notification_id : undefined;
    if (!notificationId) return new Response("notification_id is required", { status: 400 });

    apiUrl = requiredSecret("SUPABASE_URL");
    const apiKey = secretApiKey();
    headers = {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    const notificationResponse = await fetch(
      `${apiUrl}/rest/v1/breakage_slack_notifications?id=eq.${encodeURIComponent(notificationId)}&select=id,status,payload`,
      { headers },
    );
    const notifications = await notificationResponse.json() as BreakageNotification[];
    const notification = notifications[0];
    if (!notificationResponse.ok || !notification) throw new Error("Notification record was not found");
    if (notification.status === "sent") return Response.json({ status: "already_sent" });

    const slackResponse = await fetch(requiredSecret("SLACK_BREAKAGE_WEBHOOK_URL"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messageFor(notification)),
    });
    if (!slackResponse.ok) throw new Error(`Slack returned ${slackResponse.status}: ${await slackResponse.text()}`);

    await updateNotification(apiUrl, headers, notificationId, {
      status: "sent",
      delivered_at: new Date().toISOString(),
      failure: null,
    });
    return Response.json({ status: "sent" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown notification failure";
    console.error("Slack breakage notification failed", message);
    if (notificationId && apiUrl && headers) {
      try {
        await updateNotification(apiUrl, headers, notificationId, { status: "failed", failure: message });
      } catch (statusError) {
        console.error("Could not record notification failure", statusError);
      }
    }
    return new Response("Notification failed", { status: 500 });
  }
});
