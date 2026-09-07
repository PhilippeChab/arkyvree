import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { denyDemoUser, sessionMiddleware } from "@/server/middlewares/index.ts";
import { BadRequestError } from "@/server/errors/index.ts";

const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER ?? "PhilippeChab";
const GITHUB_REPO = process.env.GITHUB_REPO_NAME ?? "arkyvree-feedback-issues";

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB

const feedbackSchema = z.object({
  type: z.enum(["bug", "feedback"]),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  screenshots: z.array(z.object({
    base64: z.string(),
    mime: z.string(),
  })).max(10).optional(),
});

export default new Hono()
  .use(sessionMiddleware)
  .post(
    "/",
    denyDemoUser,
    zValidator("json", feedbackSchema),
    async (c) => {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        throw new BadRequestError("Feedback is not configured");
      }

      const { type, title, description, screenshots } = c.req.valid("json");
      const user = c.var.requestUser;

      const body = description
        ? `**Submitted by:** ${user.emailAddress}\n\n${description}`
        : `**Submitted by:** ${user.emailAddress}`;

      const githubHeaders = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      };

      // Create the issue
      const issueResponse = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues`,
        {
          method: "POST",
          headers: githubHeaders,
          body: JSON.stringify({ title, body, labels: [type] }),
        },
      );

      if (!issueResponse.ok) {
        throw new BadRequestError("Failed to submit feedback");
      }

      const issue = await issueResponse.json() as { number: number; html_url: string };

      // Upload screenshots via Contents API, then attach as a comment
      if (screenshots && screenshots.length > 0) {
        const imageUrls: string[] = [];
        const timestamp = Date.now();

        for (let i = 0; i < screenshots.length; i++) {
          const { base64, mime } = screenshots[i];
          const ext = ALLOWED_MIME_TYPES[mime];
          if (!ext) continue;

          try {
            const byteLength = Math.ceil(base64.length * 0.75); // approximate decoded size
            if (byteLength > MAX_SCREENSHOT_BYTES) continue;

            const path = `screenshots/${issue.number}/${timestamp}-${i + 1}.${ext}`;

            const uploadResponse = await fetch(
              `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`,
              {
                method: "PUT",
                headers: githubHeaders,
                body: JSON.stringify({
                  message: `feedback: screenshot for issue #${issue.number}`,
                  content: base64,
                }),
              },
            );

            if (uploadResponse.ok) {
              const data = await uploadResponse.json() as { content: { download_url: string } };
              imageUrls.push(data.content.download_url);
            }
          } catch {
            // best-effort
          }
        }

        if (imageUrls.length > 0) {
          const commentBody = imageUrls.map((url, i) => `![Screenshot ${i + 1}](${url})`).join("\n\n");
          await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${issue.number}/comments`,
            {
              method: "POST",
              headers: githubHeaders,
              body: JSON.stringify({ body: commentBody }),
            },
          );
        }
      }

      return c.json({ url: issue.html_url }, 201);
    },
  );
