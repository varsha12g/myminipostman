import { createFileRoute } from "@tanstack/react-router";
import { MiniPostman } from "@/components/MiniPostman";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "My Mini Postman — Browser-based API Testing Tool" },
      {
        name: "description",
        content:
          "Test REST APIs in your browser with GET, POST, PUT, DELETE. Inspect JSON responses, headers, status codes, and response time — no install required.",
      },
      { property: "og:title", content: "My Mini Postman" },
      {
        property: "og:description",
        content: "A minimal browser-based Postman alternative for testing APIs instantly.",
      },
    ],
  }),
  component: MiniPostman,
});
