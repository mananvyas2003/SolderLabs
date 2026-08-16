import { AiChatThread } from "@/components/ai-chat-thread";

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ org: string; project: string }>;
}) {
  const { org: orgSlug, project: projectSlug } = await params;
  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold tracking-tight">Copilot</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Chat about this project&apos;s uploaded KiCad files. Electrical facts
          are read from the latest parsed revision. Checks and merge stay
          deterministic.
        </p>
      </div>
      <AiChatThread orgSlug={orgSlug} projectSlug={projectSlug} variant="page" />
    </div>
  );
}
